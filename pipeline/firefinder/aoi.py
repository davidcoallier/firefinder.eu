"""H3 analysis grid and the common raster target grid.

Everything raster gets warped onto one fixed EPSG:4326 grid per region
(~200m pixels), then aggregated to H3 cells. The pixel→H3 lookup is computed
once and cached.
"""

import numpy as np
import h3
from rasterio.transform import from_origin

from firefinder.config import DATA_DIR, REPO_ROOT
from firefinder.regions import Region

H3_RES = 7  # ~5 km² hexes; res is a constant so caches stay coherent
GRID_RES_DEG = 0.002  # ~200 m


def cells_for_region(region: Region) -> list[str]:
    if region.country:
        return _cells_for_country(region)
    w, s, e, n = region.bbox
    poly = h3.LatLngPoly([(s, w), (s, e), (n, e), (n, w)])
    return sorted(h3.polygon_to_cells(poly, H3_RES))


def _cells_for_country(region: Region) -> list[str]:
    """H3 cells clipped to the country polygon (Natural Earth 50m)."""
    import json

    from shapely.geometry import box, shape

    geo = json.loads(
        (REPO_ROOT / "web" / "public" / "basemap" / "countries.geojson").read_text()
    )
    feats = [f for f in geo["features"] if f["properties"]["name"] == region.country]
    if not feats:
        raise KeyError(f"country not in basemap asset: {region.country}")
    clip = box(*region.bbox)
    cells: set[str] = set()
    for f in feats:
        geom = shape(f["geometry"]).intersection(clip)
        polys = getattr(geom, "geoms", [geom])
        for poly in polys:
            if poly.is_empty or poly.geom_type != "Polygon":
                continue
            # buffer slightly so coastal cells whose centre is offshore still count
            cells |= set(h3.geo_to_cells(poly.buffer(0.02), H3_RES))
    return sorted(cells)


def target_grid(region: Region):
    """(transform, width, height) of the region's common EPSG:4326 raster grid."""
    w, s, e, n = region.bbox
    width = round((e - w) / GRID_RES_DEG)
    height = round((n - s) / GRID_RES_DEG)
    return from_origin(w, n, GRID_RES_DEG, GRID_RES_DEG), width, height


def pixel_h3(region: Region) -> np.ndarray:
    """(height, width) uint64 array of the H3 cell containing each pixel centre."""
    cache = DATA_DIR / "interim" / region.id / f"h3_grid_r{H3_RES}.npy"
    if cache.exists():
        return np.load(cache)
    transform, width, height = target_grid(region)
    lons = transform.c + (np.arange(width) + 0.5) * transform.a
    lats = transform.f + (np.arange(height) + 0.5) * transform.e
    out = np.empty((height, width), dtype=np.uint64)
    for i, lat in enumerate(lats):
        row = [h3.str_to_int(h3.latlng_to_cell(lat, lon, H3_RES)) for lon in lons]
        out[i] = row
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.save(cache, out)
    return out


def h3_int_to_str(vals) -> list[str]:
    return [h3.int_to_str(int(v)) for v in vals]
