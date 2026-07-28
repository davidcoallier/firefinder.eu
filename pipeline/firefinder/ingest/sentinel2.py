"""Sentinel-2 L2A raw pipeline.

Searches the Element84 Earth Search STAC (AWS open data, no auth), does
windowed COG reads of B04/B08/B11 + SCL, applies our own cloud/shadow mask
from the scene classification layer, median-composites per month, and
aggregates NDVI/NDMI to H3 cells.
"""

import calendar
import warnings
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import rasterio
from pystac_client import Client
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds
from rasterio.windows import transform as window_transform
from tqdm import tqdm

from firefinder import regions
from firefinder.aoi import pixel_h3, target_grid, h3_int_to_str
from firefinder.config import DATA_DIR

STAC_URL = "https://earth-search.aws.element84.com/v1"
COLLECTION = "sentinel-2-l2a"
MAX_CLOUD = 60
SCENES_PER_TILE = 2
# SCL classes to keep: 4 vegetation, 5 not-vegetated, 6 water is excluded on purpose
SCL_VALID = (4, 5)

GDAL_ENV = dict(
    GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
    GDAL_HTTP_MAX_RETRY="4",
    GDAL_HTTP_RETRY_DELAY="1",
)


def _read_to_grid(href, region, resampling):
    """Windowed, decimated COG read warped onto the region target grid. NaN outside."""
    transform, width, height = target_grid(region)
    w, s, e, n = region.bbox
    with rasterio.Env(**GDAL_ENV), rasterio.open(href) as src:
        wb = rasterio.warp.transform_bounds("EPSG:4326", src.crs, w, s, e, n)
        win = from_bounds(*wb, src.transform).intersection(
            rasterio.windows.Window(0, 0, src.width, src.height)
        )
        if win.width <= 0 or win.height <= 0:
            return None
        # decimate towards the ~200m target grid so GDAL reads overviews, not full res
        scale = max(1.0, (0.002 * 111320) / src.res[0] / 2)
        out_shape = (max(1, round(win.height / scale)), max(1, round(win.width / scale)))
        data = src.read(1, window=win, out_shape=out_shape, masked=True).astype("float32")
        src_t = window_transform(win, src.transform)
        src_t = src_t * src_t.scale(win.width / out_shape[1], win.height / out_shape[0])
        dst = np.full((height, width), np.nan, dtype="float32")
        reproject(
            data.filled(np.nan), dst,
            src_transform=src_t, src_crs=src.crs,
            dst_transform=transform, dst_crs="EPSG:4326",
            resampling=resampling, src_nodata=np.nan, dst_nodata=np.nan,
        )
        return dst


def _scene_indices(item, region):
    """(ndvi, ndmi) for one scene, cloud-masked via SCL, on the target grid."""
    a = item.assets
    scl = _read_to_grid(a["scl"].href, region, Resampling.nearest)
    if scl is None:
        return None
    valid = np.isin(np.nan_to_num(scl, nan=0).astype("int16"), SCL_VALID)
    if valid.mean() < 0.005:
        return None
    red = _read_to_grid(a["red"].href, region, Resampling.average)
    nir = _read_to_grid(a["nir"].href, region, Resampling.average)
    swir = _read_to_grid(a["swir16"].href, region, Resampling.average)
    if red is None or nir is None or swir is None:
        return None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # 0/0 divisions become NaN, which is what we want
        ndvi = (nir - red) / (nir + red)
        ndmi = (nir - swir) / (nir + swir)
    ndvi[~valid] = np.nan
    ndmi[~valid] = np.nan
    return ndvi, ndmi


def _month_items(client, region, month: str):
    w, s, e, n = region.bbox
    year, mon = int(month[:4]), int(month[5:7])
    last = calendar.monthrange(year, mon)[1]
    search = client.search(
        collections=[COLLECTION],
        bbox=[w, s, e, n],
        datetime=f"{month}-01/{month}-{last:02d}",
        query={"eo:cloud_cover": {"lt": MAX_CLOUD}},
        max_items=200,
    )
    items = list(search.items())
    by_tile: dict[str, list] = {}
    for it in items:
        tile = it.properties.get("grid:code", it.id.split("_")[1] if "_" in it.id else "?")
        by_tile.setdefault(tile, []).append(it)
    picked = []
    for tile_items in by_tile.values():
        tile_items.sort(key=lambda i: i.properties.get("eo:cloud_cover", 100))
        picked.extend(tile_items[:SCENES_PER_TILE])
    return picked


def run(region: str, start: str, end: str):
    reg = regions.get(region)
    out_dir = DATA_DIR / "processed" / reg.id
    out_dir.mkdir(parents=True, exist_ok=True)
    client = Client.open(STAC_URL)
    h3_grid = pixel_h3(reg).ravel()

    months = pd.period_range(start, end, freq="M").strftime("%Y-%m")
    for month in months:
        out = out_dir / f"veg_{month}.parquet"
        if out.exists():
            continue
        items = _month_items(client, reg, month)

        def safe(it):
            try:
                return _scene_indices(it, reg)
            except rasterio.errors.RasterioIOError as err:
                print(f"  skip {it.id}: {err}")
                return None

        with ThreadPoolExecutor(max_workers=6) as ex:
            results = list(tqdm(ex.map(safe, items), total=len(items), desc=month, unit="scene"))
        ndvis = [r[0] for r in results if r is not None]
        ndmis = [r[1] for r in results if r is not None]
        if not ndvis:
            print(f"  {month}: no usable scenes")
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # all-NaN pixel stacks are expected
            ndvi = np.nanmedian(np.stack(ndvis), axis=0).ravel()
            ndmi = np.nanmedian(np.stack(ndmis), axis=0).ravel()
        df = pd.DataFrame({"h3": h3_grid, "ndvi": ndvi, "ndmi": ndmi})
        agg = df.groupby("h3").agg(
            ndvi_mean=("ndvi", "mean"),
            ndvi_p10=("ndvi", lambda s: s.quantile(0.1)),
            ndmi_mean=("ndmi", "mean"),
            valid_frac=("ndvi", lambda s: s.notna().mean()),
        ).reset_index()
        agg = agg[agg["valid_frac"] > 0.05].copy()
        agg["h3"] = h3_int_to_str(agg["h3"])
        agg["month"] = month
        agg.to_parquet(out, index=False)
        print(f"  {month}: {len(ndvis)} scenes -> {len(agg)} cells")
