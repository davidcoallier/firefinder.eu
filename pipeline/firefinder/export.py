"""Static exports for the web app.

The full grid network is too big to ship per-request through the read API, so
the context layer (every segment, simplified) is exported once as a static
geojson asset and served from web/public.
"""

import json

import geopandas as gpd

from firefinder import regions
from firefinder.config import DATA_DIR, REPO_ROOT


def grid_geojson(region: str):
    reg = regions.get(region)
    segs = gpd.read_parquet(DATA_DIR / "processed" / reg.id / "segments.parquet")
    segs = segs.set_geometry(segs.geometry.simplify(0.0005))
    features = []
    for r in segs.itertuples():
        coords = [[round(x, 4), round(y, 4)] for x, y in r.geometry.coords]
        if len(coords) < 2:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": {},
            }
        )
    out = REPO_ROOT / "web" / "public" / "basemap" / f"grid-{reg.id}.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    print(f"{len(features)} context segments -> {out.name} ({out.stat().st_size // 1024} KB)")
