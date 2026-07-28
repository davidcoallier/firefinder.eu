"""Power line geometry from OpenStreetMap.

Overpass first; if the public mirrors rate-limit us, fall back to parsing the
Geofabrik country extract locally.
"""

import re
import time

import geopandas as gpd
import numpy as np
import requests
from shapely.geometry import LineString
from shapely.ops import substring

from firefinder import regions
from firefinder.config import DATA_DIR

GEOFABRIK = {
    "pt-centro": ["europe/portugal"],
    "portugal": ["europe/portugal"],
    "spain": ["europe/spain"],
    "france": ["europe/france"],
    "pilot-pt-galicia": ["europe/portugal", "europe/spain/galicia"],
}

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
MAX_SEGMENT_M = 5000


def _parse_voltage(tags) -> float | None:
    raw = tags.get("voltage")
    if not raw:
        return None
    m = re.search(r"\d+", raw.split(";")[0])
    if not m:
        return None
    v = float(m.group())
    return v / 1000 if v > 1000 else v


def fetch_ways(region):
    w, s, e, n = region.bbox
    q = f'[out:json][timeout:180];way["power"~"^(line|minor_line)$"]({s},{w},{n},{e});out tags geom;'
    last = None
    for attempt in range(2):
        for url in MIRRORS:
            try:
                r = requests.post(url, data={"data": q}, timeout=240)
                r.raise_for_status()
                return r.json()["elements"]
            except Exception as err:
                last = err
        time.sleep(10 * (attempt + 1))
    print(f"Overpass unavailable ({last}), falling back to Geofabrik extract")
    return fetch_ways_geofabrik(region)


def fetch_ways_geofabrik(region):
    """Parse power lines from Geofabrik PBF extracts. Same element shape as Overpass."""
    import osmium

    w, s, e, n = region.bbox
    elements = []

    class Handler(osmium.SimpleHandler):
        def way(self, way):
            if way.tags.get("power") not in ("line", "minor_line"):
                return
            coords = []
            for node in way.nodes:
                try:
                    lon, lat = node.location.lon, node.location.lat
                except osmium.InvalidLocationError:
                    continue
                coords.append({"lon": lon, "lat": lat})
            if not any(w <= c["lon"] <= e and s <= c["lat"] <= n for c in coords):
                return
            elements.append(
                {"id": way.id, "tags": {t.k: t.v for t in way.tags}, "geometry": coords}
            )

    raw_dir = DATA_DIR / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    for extract in GEOFABRIK[region.id]:
        pbf = raw_dir / (extract.replace("/", "_") + "-latest.osm.pbf")
        if not pbf.exists():
            url = f"https://download.geofabrik.de/{extract}-latest.osm.pbf"
            print(f"downloading {url}")
            with requests.get(url, stream=True, timeout=1200) as r:
                r.raise_for_status()
                tmp = pbf.with_suffix(".part")
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
                tmp.rename(pbf)
        Handler().apply_file(str(pbf), locations=True)
    return elements


def fetch_places(region):
    """place=city/town/village nodes from the Geofabrik extract, for naming corridors."""
    import osmium

    w, s, e, n = region.bbox
    places = []

    class Handler(osmium.SimpleHandler):
        def node(self, node):
            if node.tags.get("place") not in ("city", "town", "village"):
                return
            name = node.tags.get("name")
            if not name or not node.location.valid():
                return
            lon, lat = node.location.lon, node.location.lat
            if w <= lon <= e and s <= lat <= n:
                places.append({"name": name, "kind": node.tags["place"], "lat": lat, "lon": lon})

    raw_dir = DATA_DIR / "raw"
    for extract in GEOFABRIK[region.id]:
        pbf = raw_dir / (extract.replace("/", "_") + "-latest.osm.pbf")
        if pbf.exists():
            Handler().apply_file(str(pbf))
    return places


def _assign_localities(gdf, region):
    """Nearest town/city per segment midpoint; villages only fill gaps."""
    from scipy.spatial import cKDTree

    places = fetch_places(region)
    if not places:
        gdf["locality"] = None
        return gdf
    mid = gdf.geometry.to_crs("EPSG:3035").interpolate(0.5, normalized=True)
    mid_xy = np.c_[mid.x, mid.y]
    metric = gpd.GeoSeries(
        gpd.points_from_xy([p["lon"] for p in places], [p["lat"] for p in places]),
        crs="EPSG:4326",
    ).to_crs("EPSG:3035")
    xy = np.c_[metric.x, metric.y]
    towns = [i for i, p in enumerate(places) if p["kind"] in ("city", "town")]
    d_town, i_town = cKDTree(xy[towns]).query(mid_xy)
    d_any, i_any = cKDTree(xy).query(mid_xy)
    names = []
    for dt, it, da, ia in zip(d_town, i_town, d_any, i_any):
        if dt <= 10_000:  # a town within 10km beats a closer village
            names.append(places[towns[it]]["name"])
        else:
            names.append(places[ia]["name"])
    gdf["locality"] = names
    return gdf


def run(region: str):
    reg = regions.get(region)
    if (DATA_DIR / "processed" / reg.id / "segments.parquet").exists():
        print("segments.parquet exists, skipping")
        return
    rows = []
    for way in fetch_ways(reg):
        coords = [(p["lon"], p["lat"]) for p in way.get("geometry", [])]
        if len(coords) < 2:
            continue
        line = LineString(coords)
        tags = way.get("tags", {})
        # split long ways into <=5km corridor segments in a metric CRS
        metric = gpd.GeoSeries([line], crs="EPSG:4326").to_crs("EPSG:3035").iloc[0]
        n_parts = max(1, int(metric.length // MAX_SEGMENT_M) + 1)
        step = metric.length / n_parts
        for k in range(n_parts):
            part = substring(metric, k * step, (k + 1) * step)
            if part.is_empty or part.length < 50:
                continue
            rows.append(
                {
                    "osm_way_id": way["id"],
                    "voltage_kv": _parse_voltage(tags),
                    "operator": tags.get("operator"),
                    "length_m": round(part.length, 1),
                    "geometry": part,
                }
            )
    gdf = gpd.GeoDataFrame(rows, crs="EPSG:3035").to_crs("EPSG:4326")
    gdf = _assign_localities(gdf, reg)
    out_dir = DATA_DIR / "processed" / reg.id
    out_dir.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(out_dir / "segments.parquet")
    print(f"{len(gdf)} segments from {gdf['osm_way_id'].nunique()} OSM ways")
