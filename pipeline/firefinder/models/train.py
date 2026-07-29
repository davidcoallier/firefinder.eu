"""Train the ignition model.

Temporal holdout: everything before `test_year` trains, `test_year` onwards
evaluates. Reported as PR-AUC + ROC-AUC + a calibration table — ignition is a
rare event, accuracy would be noise. After evaluation the model is refit on
all data for live scoring.
"""

import json

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import average_precision_score, roc_auc_score

from firefinder import regions
from firefinder.config import DATA_DIR, REPO_ROOT

FEATURES = [
    "ndvi_mean", "ndvi_p10", "ndmi_mean", "ndvi_anom",
    "tmax", "rh_min", "wind_max", "gust_max", "precip_sum", "et0_sum",
    "precip_30d", "precip_90d",
    "elevation_m", "slope_deg",
    "tree_frac", "shrub_frac", "grass_frac", "crop_frac",
    "dist_powerline_m", "week_sin", "week_cos",
]
PARAMS = dict(
    n_estimators=400, max_depth=6, learning_rate=0.05,
    subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
    eval_metric="aucpr", tree_method="hist", n_jobs=-1,
)


def _fit(X, y):
    pos = max(int(y.sum()), 1)
    model = xgb.XGBClassifier(**PARAMS, scale_pos_weight=(len(y) - pos) / pos)
    model.fit(X, y, verbose=False)
    return model


def _calibration(y_true, y_prob, bins=10):
    df = pd.DataFrame({"y": y_true, "p": y_prob})
    df["bin"] = pd.qcut(df["p"], bins, duplicates="drop")
    out = df.groupby("bin", observed=True).agg(mean_pred=("p", "mean"), frac_fire=("y", "mean"), n=("y", "size"))
    return [
        {"mean_pred": round(r.mean_pred, 5), "frac_fire": round(r.frac_fire, 5), "n": int(r.n)}
        for r in out.itertuples()
    ]


def run(region: str, test_year: int = 2024):
    reg = regions.get(region)
    proc_dir = DATA_DIR / "processed" / reg.id
    df = pd.read_parquet(proc_dir / "features.parquet")
    df = df.dropna(subset=["ndvi_mean"])  # cells/weeks with no usable composite yet

    train = df[df["week"].dt.year < test_year]
    test = df[df["week"].dt.year >= test_year]
    model = _fit(train[FEATURES], train["fire"])
    p = model.predict_proba(test[FEATURES])[:, 1]

    metrics = {
        "test_from_year": test_year,
        "n_train": len(train), "n_test": len(test),
        "pos_train": int(train["fire"].sum()), "pos_test": int(test["fire"].sum()),
        "base_rate_test": round(float(test["fire"].mean()), 6),
        "pr_auc": round(float(average_precision_score(test["fire"], p)), 4),
        "roc_auc": round(float(roc_auc_score(test["fire"], p)), 4),
        "calibration": _calibration(test["fire"].values, p),
        "by_year": {},
    }
    for year, gdf in test.groupby(test["week"].dt.year):
        if gdf["fire"].sum() == 0:
            continue
        py = model.predict_proba(gdf[FEATURES])[:, 1]
        metrics["by_year"][int(year)] = {
            "pr_auc": round(float(average_precision_score(gdf["fire"], py)), 4),
            "roc_auc": round(float(roc_auc_score(gdf["fire"], py)), 4),
            "positives": int(gdf["fire"].sum()),
        }

    # models live in the repo (small json), so CI scoring runs don't retrain
    model_dir = REPO_ROOT / "pipeline" / "models" / reg.id
    model_dir.mkdir(parents=True, exist_ok=True)
    # refit on everything for the live model
    full = _fit(df[FEATURES], df["fire"])
    full.save_model(model_dir / "model_full.json")
    model.save_model(model_dir / "model_holdout.json")
    (model_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (model_dir / "features.json").write_text(json.dumps(FEATURES))
    print(json.dumps({k: v for k, v in metrics.items() if k != "calibration"}, indent=2))
