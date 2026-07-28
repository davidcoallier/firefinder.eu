"""Score a week: per-cell ignition probability + SHAP drivers, then aggregate
onto power line corridors and rank them."""

import json

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from shapely.geometry import Point

from firefinder import db, regions
from firefinder.config import DATA_DIR

BUFFER_M = 500
TOP_DRIVERS = 6


def _load_model(model_dir):
    model = xgb.XGBClassifier()
    model.load_model(model_dir / "model_full.json")
    features = json.loads((model_dir / "features.json").read_text())
    return model, features


def run(region: str, week: str):
    reg = regions.get(region)
    proc_dir = DATA_DIR / "processed" / reg.id
    model, features = _load_model(proc_dir / "model")
    version = "xgb-" + pd.Timestamp.now().strftime("%Y%m%d")

    df = pd.read_parquet(proc_dir / "features.parquet")
    wk = pd.Timestamp(week).to_period("W-SUN").start_time
    df = df[df["week"] == wk].dropna(subset=["ndvi_mean"]).reset_index(drop=True)
    if df.empty:
        raise SystemExit(f"no feature rows for week {wk.date()} — run `features build` first")

    X = df[features]
    p = model.predict_proba(X)[:, 1]
    sv = shap.TreeExplainer(model).shap_values(X)

    def drivers(i):
        order = np.argsort(-np.abs(sv[i]))[:TOP_DRIVERS]
        return {features[j]: round(float(sv[i][j]), 4) for j in order}

    cell_rows = [(df.at[i, "h3"], p[i], drivers(i)) for i in range(len(df))]
    db.write_cell_scores(reg.id, wk.date(), cell_rows, version)

    # corridor aggregation: cells whose centre falls within 500m of the line
    segs = db.segment_ids(reg.id).to_crs("EPSG:3763")
    segs["geom_buf"] = segs.geometry.buffer(BUFFER_M)
    buf = segs.set_geometry("geom_buf")
    cent = gpd.GeoDataFrame(
        {"h3": df["h3"], "p": p},
        geometry=[Point(lng, lat) for lat, lng in (h3.cell_to_latlng(c) for c in df["h3"])],
        crs="EPSG:4326",
    ).to_crs("EPSG:3763")
    hits = gpd.sjoin(cent, buf[["id", "geom_buf"]], predicate="within")
    agg = hits.groupby("id").agg(p_max=("p", "max"), p_mean=("p", "mean"))
    agg["risk"] = 0.65 * agg["p_max"] + 0.35 * agg["p_mean"]
    agg = agg.sort_values("risk", ascending=False)
    agg["rank"] = range(1, len(agg) + 1)

    top_cell = hits.sort_values("p").groupby("id")["h3"].last()
    cell_drivers = {df.at[i, "h3"]: drivers(i) for i in range(len(df))}
    seg_rows = [
        (i, r["risk"], r["rank"], cell_drivers.get(top_cell.get(i), {}))
        for i, r in agg.iterrows()
    ]
    db.write_segment_scores(reg.id, wk.date(), seg_rows, version)
    print(
        f"week {wk.date()}: {len(cell_rows)} cells "
        f"(p in [{p.min():.4f}, {p.max():.4f}]), {len(seg_rows)} corridors ranked"
    )
