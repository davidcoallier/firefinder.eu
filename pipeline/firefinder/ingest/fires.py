"""Fire labels from EFFIS burnt-area perimeters (MODIS-derived, EU-wide, no auth)."""

import time

import geopandas as gpd
import pandas as pd
import requests

from firefinder import regions
from firefinder.config import DATA_DIR

WFS_HOSTS = [
    "https://maps.effis.emergency.copernicus.eu/effis",
    "https://ies-ows.jrc.ec.europa.eu/effis",
]
LAYER = "ms:modis.ba.poly"


def fetch(region) -> gpd.GeoDataFrame:
    w, s, e, n = region.bbox
    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typename": LAYER,
        "outputFormat": "geojson",
        "srsName": "EPSG:4326",
        # WFS 1.1.0 + EPSG:4326 uses lat,lon axis order
        "bbox": f"{s},{w},{n},{e},EPSG:4326",
        "maxFeatures": "200000",
    }
    last_err = None
    for attempt in range(3):
        for host in WFS_HOSTS:
            try:
                r = requests.get(host, params=params, timeout=120)
                r.raise_for_status()
                gdf = gpd.GeoDataFrame.from_features(r.json()["features"], crs="EPSG:4326")
                if len(gdf):
                    return gdf
            except Exception as err:  # try next mirror
                last_err = err
        time.sleep(30 * (attempt + 1))
    raise RuntimeError(f"EFFIS WFS failed on all mirrors: {last_err}")


def run(region: str, force: bool = False):
    reg = regions.get(region)
    if not force and (DATA_DIR / "processed" / reg.id / "fires.parquet").exists():
        print("fires.parquet exists, skipping")
        return
    gdf = fetch(reg)
    cols = {c.lower(): c for c in gdf.columns}
    date_col = cols.get("firedate") or cols.get("initialdate")
    area_col = cols.get("area_ha")
    out = gpd.GeoDataFrame(
        {
            "event_date": pd.to_datetime(gdf[date_col], format="mixed", errors="coerce").dt.date,
            "area_ha": gdf[area_col] if area_col else None,
            "source": "effis",
        },
        geometry=gdf.geometry,
        crs="EPSG:4326",
    )
    out = out[out.geometry.is_valid & ~out.geometry.is_empty & out["event_date"].notna()]
    out_dir = DATA_DIR / "processed" / reg.id
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = out_dir / "fires.parquet.tmp"
    out.to_parquet(tmp)
    tmp.rename(out_dir / "fires.parquet")
    print(f"{len(out)} fire perimeters, {out['event_date'].min()} .. {out['event_date'].max()}")
