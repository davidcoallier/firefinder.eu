"""Static terrain + land cover per H3 cell.

Copernicus DEM GLO-30 (AWS open data) for elevation/slope, ESA WorldCover 2021
for land-cover fractions. Both warped onto the region target grid.
"""

import math
import warnings

import numpy as np
import pandas as pd
import rasterio
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds
from rasterio.windows import transform as window_transform

from firefinder import regions
from firefinder.aoi import GRID_RES_DEG, pixel_h3, target_grid, h3_int_to_str
from firefinder.config import DATA_DIR

DEM_URL = (
    "https://copernicus-dem-30m.s3.amazonaws.com/"
    "Copernicus_DSM_COG_10_{lat}_00_{lon}_00_DEM/Copernicus_DSM_COG_10_{lat}_00_{lon}_00_DEM.tif"
)
WC_URL = (
    "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
    "ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
)
WC_CLASSES = {"tree_frac": 10, "shrub_frac": 20, "grass_frac": 30, "crop_frac": 40, "builtup_frac": 50}


def _tile_name(lat: int, lon: int) -> tuple[str, str]:
    return (
        f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}",
        f"{'E' if lon >= 0 else 'W'}{abs(lon):03d}",
    )


def _warp_into(href, region, dst, resampling):
    transform, width, height = target_grid(region)
    w, s, e, n = region.bbox
    with rasterio.open(href) as src:
        wb = rasterio.warp.transform_bounds("EPSG:4326", src.crs, w, s, e, n)
        win = from_bounds(*wb, src.transform).intersection(
            rasterio.windows.Window(0, 0, src.width, src.height)
        )
        if win.width <= 0 or win.height <= 0:
            return
        scale = max(1.0, GRID_RES_DEG / abs(src.transform.a) / 2)
        out_shape = (max(1, round(win.height / scale)), max(1, round(win.width / scale)))
        data = src.read(1, window=win, out_shape=out_shape, masked=True).astype("float32")
        src_t = window_transform(win, src.transform)
        src_t = src_t * src_t.scale(win.width / out_shape[1], win.height / out_shape[0])
        tmp = np.full(dst.shape, np.nan, dtype="float32")
        reproject(
            data.filled(np.nan), tmp,
            src_transform=src_t, src_crs=src.crs,
            dst_transform=transform, dst_crs="EPSG:4326",
            resampling=resampling, src_nodata=np.nan, dst_nodata=np.nan,
        )
        keep = ~np.isnan(tmp)
        dst[keep] = tmp[keep]


def run(region: str):
    reg = regions.get(region)
    if (DATA_DIR / "processed" / reg.id / "terrain.parquet").exists():
        print("terrain.parquet exists, skipping")
        return
    transform, width, height = target_grid(reg)
    w, s, e, n = reg.bbox

    elev = np.full((height, width), np.nan, dtype="float32")
    for lat in range(math.floor(s), math.ceil(n)):
        for lon in range(math.floor(w), math.ceil(e)):
            la, lo = _tile_name(lat, lon)
            try:
                _warp_into(DEM_URL.format(lat=la, lon=lo), reg, elev, Resampling.average)
            except rasterio.errors.RasterioIOError:
                print(f"  no DEM tile {la}{lo} (ocean?)")

    # slope from the elevation grid, degrees
    mid_lat = (s + n) / 2
    dy = GRID_RES_DEG * 111_320
    dx = dy * math.cos(math.radians(mid_lat))
    gy, gx = np.gradient(elev, dy, dx)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))

    lc = np.full((height, width), np.nan, dtype="float32")
    for lat in range(math.floor(s / 3) * 3, math.ceil(n / 3) * 3, 3):
        for lon in range(math.floor(w / 3) * 3, math.ceil(e / 3) * 3, 3):
            la, lo = _tile_name(lat, lon)
            try:
                _warp_into(WC_URL.format(tile=f"{la}{lo}"), reg, lc, Resampling.nearest)
            except rasterio.errors.RasterioIOError:
                print(f"  no WorldCover tile {la}{lo}")

    df = pd.DataFrame({"h3": pixel_h3(reg).ravel(), "elev": elev.ravel(), "slope": slope.ravel(), "lc": lc.ravel()})
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        agg = df.groupby("h3").agg(elevation_m=("elev", "mean"), slope_deg=("slope", "mean"))
        for name, cls in WC_CLASSES.items():
            agg[name] = df.assign(hit=(df["lc"] == cls)).groupby("h3")["hit"].mean()
    agg = agg.reset_index()
    agg["h3"] = h3_int_to_str(agg["h3"])
    out_dir = DATA_DIR / "processed" / reg.id
    out_dir.mkdir(parents=True, exist_ok=True)
    agg.to_parquet(out_dir / "terrain.parquet", index=False)
    print(f"{len(agg)} cells with terrain/landcover")
