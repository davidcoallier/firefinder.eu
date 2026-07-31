"""Train the ignition model.

A seed-diverse XGBoost ensemble with isotonic calibration:

- Temporal holdout: everything before `test_year` trains, `test_year` onwards
  evaluates. Reported as PR-AUC + ROC-AUC + a calibration table; ignition is a
  rare event, so accuracy would be noise.
- Five members differ by seed and row subsample. The scored probability is the
  member mean; member disagreement (std) ships as a per-cell spread.
- An isotonic calibrator is fitted on the holdout predictions so the mean is a
  usable likelihood, not just a ranking score. Isotonic is monotone, so the
  ranking metrics above are unaffected by it.
- A `rank:pairwise` ranker (weeks as query groups) trains on the same split and
  its holdout metrics are reported as an experiment, since ranking corridors
  is what the product actually does.

After evaluation the ensemble is refit on all data for live scoring.
"""

import json

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
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
    colsample_bytree=0.8, min_child_weight=5,
    eval_metric="aucpr", tree_method="hist", n_jobs=-1,
)
N_MEMBERS = 5
SUBSAMPLES = [0.7, 0.75, 0.8, 0.85, 0.9]


def _fit_member(X, y, seed: int):
    pos = max(int(y.sum()), 1)
    model = xgb.XGBClassifier(
        **PARAMS,
        subsample=SUBSAMPLES[seed % len(SUBSAMPLES)],
        random_state=seed,
        scale_pos_weight=(len(y) - pos) / pos,
    )
    model.fit(X, y, verbose=False)
    return model


def _fit_ensemble(X, y):
    return [_fit_member(X, y, seed) for seed in range(N_MEMBERS)]


def _ensemble_proba(members, X) -> np.ndarray:
    return np.mean([m.predict_proba(X)[:, 1] for m in members], axis=0)


def _fit_ranker(train, test):
    """rank:pairwise with weeks as query groups; holdout metrics only."""
    tr = train.sort_values("week")
    te = test.sort_values("week")
    ranker = xgb.XGBRanker(
        objective="rank:pairwise",
        n_estimators=400, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, tree_method="hist", n_jobs=-1,
    )
    ranker.fit(tr[FEATURES], tr["fire"], group=tr.groupby("week", sort=True).size().values)
    scores = ranker.predict(te[FEATURES])
    return {
        "pr_auc": round(float(average_precision_score(te["fire"], scores)), 4),
        "roc_auc": round(float(roc_auc_score(te["fire"], scores)), 4),
    }


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

    members = _fit_ensemble(train[FEATURES], train["fire"])
    p_single = members[0].predict_proba(test[FEATURES])[:, 1]
    p_ens = _ensemble_proba(members, test[FEATURES])

    # isotonic calibrator fitted forward: only the FIRST held-out season is
    # used for fitting, leaving later seasons untouched for reliability
    # reporting. Monotone, so ranking metrics are unaffected either way.
    cal_mask = (test["week"].dt.year == test_year).values
    iso = IsotonicRegression(out_of_bounds="clip")
    iso.fit(p_ens[cal_mask], test["fire"].values[cal_mask])

    metrics = {
        "test_from_year": test_year,
        "n_train": len(train), "n_test": len(test),
        "pos_train": int(train["fire"].sum()), "pos_test": int(test["fire"].sum()),
        "base_rate_test": round(float(test["fire"].mean()), 6),
        "n_members": N_MEMBERS,
        "single_member": {
            "pr_auc": round(float(average_precision_score(test["fire"], p_single)), 4),
            "roc_auc": round(float(roc_auc_score(test["fire"], p_single)), 4),
        },
        "ensemble": {
            "pr_auc": round(float(average_precision_score(test["fire"], p_ens)), 4),
            "roc_auc": round(float(roc_auc_score(test["fire"], p_ens)), 4),
        },
        "ranker_experiment": _fit_ranker(train, test),
        "pr_auc": round(float(average_precision_score(test["fire"], p_ens)), 4),
        "roc_auc": round(float(roc_auc_score(test["fire"], p_ens)), 4),
        "calibration_before_isotonic": _calibration(test["fire"].values, p_ens),
        "by_year": {},
    }
    for year, gdf in test.groupby(test["week"].dt.year):
        if gdf["fire"].sum() == 0:
            continue
        py = _ensemble_proba(members, gdf[FEATURES])
        metrics["by_year"][int(year)] = {
            "pr_auc": round(float(average_precision_score(gdf["fire"], py)), 4),
            "roc_auc": round(float(roc_auc_score(gdf["fire"], py)), 4),
            "positives": int(gdf["fire"].sum()),
        }

    # models live in the repo (small json), so CI scoring runs don't retrain
    model_dir = REPO_ROOT / "pipeline" / "models" / reg.id
    model_dir.mkdir(parents=True, exist_ok=True)
    # refit every member on everything for the live ensemble
    full = _fit_ensemble(df[FEATURES], df["fire"])
    for i, m in enumerate(full):
        m.save_model(model_dir / f"member_{i}.json")
    members[0].save_model(model_dir / "model_holdout.json")
    (model_dir / "model_full.json").unlink(missing_ok=True)  # superseded by members
    (model_dir / "calibration.json").write_text(json.dumps({
        "x": [round(float(v), 6) for v in iso.X_thresholds_],
        "y": [round(float(v), 6) for v in iso.y_thresholds_],
    }))
    (model_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (model_dir / "features.json").write_text(json.dumps(FEATURES))
    print(json.dumps({k: v for k, v in metrics.items()
                      if k not in ("calibration_before_isotonic", "by_year")}, indent=2))
