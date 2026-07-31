"""Score a week: calibrated ensemble ignition probability + SHAP drivers per
cell, then aggregate onto power line corridors and rank them.

The score is the mean of the ensemble members, passed through the isotonic
calibrator fitted at train time. Member disagreement (std of the raw member
probabilities) is stored per cell as `p_spread`.
"""

import json

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from shapely.geometry import Point

from firefinder import db, regions
from firefinder.config import DATA_DIR, REPO_ROOT

BUFFER_M = 500
TOP_DRIVERS = 6


def _load_ensemble(model_dir):
    members = []
    for path in sorted(model_dir.glob("member_*.json")):
        m = xgb.XGBClassifier()
        m.load_model(path)
        members.append(m)
    if not members:
        raise SystemExit(f"no ensemble members in {model_dir} — run `train` first")
    features = json.loads((model_dir / "features.json").read_text())
    cal = json.loads((model_dir / "calibration.json").read_text())
    return members, features, (np.array(cal["x"]), np.array(cal["y"]))


def _calibrate(p_raw, cal):
    x, y = cal
    return np.clip(np.interp(p_raw, x, y), 0.0, 1.0)


def run(region: str, week: str):
    reg = regions.get(region)
    proc_dir = DATA_DIR / "processed" / reg.id
    members, features, cal = _load_ensemble(REPO_ROOT / "pipeline" / "models" / reg.id)
    version = f"xgb-ens{len(members)}-" + pd.Timestamp.now().strftime("%Y%m%d")

    df = pd.read_parquet(proc_dir / "features.parquet")
    wk = pd.Timestamp(week).to_period("W-SUN").start_time
    df = df[df["week"] == wk].dropna(subset=["ndvi_mean"]).reset_index(drop=True)
    if df.empty:
        raise SystemExit(f"no feature rows for week {wk.date()} — run `features build` first")

    X = df[features]
    member_p = np.stack([m.predict_proba(X)[:, 1] for m in members])
    p_raw = member_p.mean(axis=0)
    spread = member_p.std(axis=0)
    p = _calibrate(p_raw, cal)

    # drivers: SHAP averaged across members, so the explanation matches the
    # ensemble score rather than any single tree's opinion
    sv = np.mean([shap.TreeExplainer(m).shap_values(X) for m in members], axis=0)

    def drivers(i):
        order = np.argsort(-np.abs(sv[i]))[:TOP_DRIVERS]
        return {features[j]: round(float(sv[i][j]), 4) for j in order}

    cell_rows = [
        (df.at[i, "h3"], p[i], spread[i], drivers(i)) for i in range(len(df))
    ]
    db.write_cell_scores(reg.id, wk.date(), cell_rows, version)

    # corridor aggregation: cells whose centre falls within 500m of the line
    segs = db.segment_ids(reg.id).to_crs("EPSG:3035")
    segs["geom_buf"] = segs.geometry.buffer(BUFFER_M)
    buf = segs.set_geometry("geom_buf")
    cent = gpd.GeoDataFrame(
        {"h3": df["h3"], "p": p},
        geometry=[Point(lng, lat) for lat, lng in (h3.cell_to_latlng(c) for c in df["h3"])],
        crs="EPSG:4326",
    ).to_crs("EPSG:3035")
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
        f"(p in [{p.min():.4f}, {p.max():.4f}], spread median {np.median(spread):.4f}), "
        f"{len(seg_rows)} corridors ranked"
    )
