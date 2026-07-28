"""Assemble the H3 cell-week feature table.

One row per (cell, fire-season week). Vegetation comes from the latest monthly
composite *before* the week (no leakage from post-fire NDVI drop); weather is
the week's own observations, standing in for a forecast; label is whether an
EFFIS perimeter with a fire date in that week touches the cell.
"""

import warnings

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from shapely.geometry import Point

from firefinder import regions
from firefinder.aoi import H3_RES, cells_for_region
from firefinder.config import DATA_DIR

SEASON_MONTHS = range(4, 11)  # April..October


def _cell_centroids(cells: list[str]) -> gpd.GeoDataFrame:
    pts = [h3.cell_to_latlng(c) for c in cells]
    return gpd.GeoDataFrame(
        {"h3": cells}, geometry=[Point(lng, lat) for lat, lng in pts], crs="EPSG:4326"
    )


def _dist_to_powerline(centroids: gpd.GeoDataFrame, proc_dir) -> pd.DataFrame:
    segs = gpd.read_parquet(proc_dir / "segments.parquet").to_crs("EPSG:3763")
    joined = gpd.sjoin_nearest(
        centroids.to_crs("EPSG:3763"), segs[["geometry"]], distance_col="dist_powerline_m"
    )
    return joined.groupby("h3", as_index=False)["dist_powerline_m"].min()


def _weekly_weather(proc_dir) -> pd.DataFrame:
    wx = pd.read_parquet(proc_dir / "weather.parquet")
    wx["date"] = pd.to_datetime(wx["date"])
    wx["point"] = wx["lat"].astype(str) + "," + wx["lon"].astype(str)
    wx = wx.sort_values("date")
    # antecedent dryness: trailing precip sums up to the day before
    wx["precip_30d"] = wx.groupby("point")["precip"].transform(
        lambda s: s.rolling(30, min_periods=10).sum().shift(1)
    )
    wx["precip_90d"] = wx.groupby("point")["precip"].transform(
        lambda s: s.rolling(90, min_periods=30).sum().shift(1)
    )
    wx["week"] = wx["date"].dt.to_period("W-SUN").dt.start_time  # Monday-start weeks
    weekly = (
        wx.groupby(["point", "lat", "lon", "week"])
        .agg(
            tmax=("tmax", "max"),
            rh_min=("rh_min", "min"),
            wind_max=("wind_max", "max"),
            gust_max=("gust_max", "max"),
            precip_sum=("precip", "sum"),
            et0_sum=("et0", "sum"),
            precip_30d=("precip_30d", "first"),
            precip_90d=("precip_90d", "first"),
            days=("date", "count"),
        )
        .reset_index()
    )
    return weekly[weekly["days"] >= 5].drop(columns="days")


def _veg(proc_dir) -> pd.DataFrame:
    frames = [pd.read_parquet(p) for p in sorted(proc_dir.glob("veg_*.parquet"))]
    veg = pd.concat(frames, ignore_index=True)
    veg["month_end"] = pd.PeriodIndex(veg["month"], freq="M").to_timestamp(how="end").normalize()
    clim = (
        veg.assign(cal_month=pd.PeriodIndex(veg["month"], freq="M").month)
        .groupby(["h3", "cal_month"])["ndvi_mean"]
        .transform("mean")
    )
    veg["ndvi_anom"] = veg["ndvi_mean"] - clim
    return veg.sort_values("month_end")


def _labels(proc_dir) -> pd.DataFrame:
    fires = gpd.read_parquet(proc_dir / "fires.parquet")
    rows = []
    for _, f in fires.iterrows():
        geom = f.geometry
        try:
            cells = h3.geo_to_cells(geom, H3_RES)
        except Exception:
            cells = []
        if not cells:
            c = geom.centroid
            cells = [h3.latlng_to_cell(c.y, c.x, H3_RES)]
        week = pd.Timestamp(f["event_date"]).to_period("W-SUN").start_time
        rows.extend({"h3": c, "week": week, "fire": 1} for c in cells)
    return pd.DataFrame(rows).drop_duplicates()


def run(region: str):
    reg = regions.get(region)
    proc_dir = DATA_DIR / "processed" / reg.id
    cells = cells_for_region(reg)
    centroids = _cell_centroids(cells)

    static = pd.read_parquet(proc_dir / "terrain.parquet")
    static = static.merge(_dist_to_powerline(centroids, proc_dir), on="h3", how="left")

    weekly = _weekly_weather(proc_dir)
    veg = _veg(proc_dir)
    labels = _labels(proc_dir)

    # nearest weather point per cell
    pts = weekly[["point", "lat", "lon"]].drop_duplicates()
    tree = cKDTree(pts[["lat", "lon"]].values)
    cent_ll = np.array([[p.y, p.x] for p in centroids.geometry])
    nearest = tree.query(cent_ll)[1]
    cell_point = pd.DataFrame({"h3": centroids["h3"], "point": pts["point"].values[nearest]})

    weeks = weekly.loc[weekly["week"].dt.month.isin(SEASON_MONTHS), "week"].sort_values().unique()
    base = pd.MultiIndex.from_product([cells, weeks], names=["h3", "week"]).to_frame(index=False)
    df = (
        base.merge(cell_point, on="h3")
        .merge(weekly.drop(columns=["lat", "lon"]), on=["point", "week"])
        .merge(static, on="h3", how="left")
    )
    # latest composite strictly before the week start, per cell
    df = pd.merge_asof(
        df.sort_values("week"),
        veg[["h3", "month_end", "ndvi_mean", "ndvi_p10", "ndmi_mean", "ndvi_anom"]].rename(
            columns={"month_end": "week"}
        ).sort_values("week"),
        on="week", by="h3", direction="backward", allow_exact_matches=False,
    )
    df = df.merge(labels, on=["h3", "week"], how="left")
    df["fire"] = df["fire"].fillna(0).astype("int8")
    woy = df["week"].dt.isocalendar().week.astype(float)
    df["week_sin"] = np.sin(2 * np.pi * woy / 52)
    df["week_cos"] = np.cos(2 * np.pi * woy / 52)
    df = df.drop(columns=["point"])

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        df.to_parquet(proc_dir / "features.parquet", index=False)
    pos = int(df["fire"].sum())
    print(f"{len(df)} cell-weeks, {pos} positives ({pos / len(df):.4%}), "
          f"{df['week'].min().date()} .. {df['week'].max().date()}")
