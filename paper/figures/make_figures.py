"""Generate the paper's figures from the real pipeline data.

Refits the train-split ensemble for Portugal (the ablation region), predicts
the 2024+ holdout, and draws: PR curves, a reliability diagram before/after
isotonic calibration, ensemble-mean SHAP importances, and per-year ROC-AUC
bars for all three regions from their metrics.json files.
"""

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import precision_recall_curve

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "pipeline"))

from firefinder.models.train import FEATURES, _fit_ensemble, _ensemble_proba  # noqa: E402

OUT = Path(__file__).resolve().parent
plt.rcParams.update({"font.size": 9, "figure.dpi": 150})


def main():
    df = pd.read_parquet(REPO / "data/processed/portugal/features.parquet")
    df = df.dropna(subset=["ndvi_mean"])
    train = df[df["week"].dt.year < 2024]
    test = df[df["week"].dt.year >= 2024]

    print("fitting train-split ensemble...")
    members = _fit_ensemble(train[FEATURES], train["fire"])
    member_p = np.stack([m.predict_proba(test[FEATURES])[:, 1] for m in members])
    p_single = member_p[0]
    p_ens = member_p.mean(axis=0)
    y = test["fire"].values

    # Figure 1: PR curves
    fig, ax = plt.subplots(figsize=(4.2, 3.2))
    for p, label, style in [(p_single, "Single model", "--"), (p_ens, "Ensemble (K=5)", "-")]:
        prec, rec, _ = precision_recall_curve(y, p)
        ax.plot(rec, prec, style, linewidth=1.4, label=label)
    ax.axhline(y.mean(), color="gray", linewidth=0.8, linestyle=":", label="Random (base rate)")
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_yscale("log")
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(OUT / "pr_curves.pdf")

    # Figure 2: reliability before/after isotonic (quantile bins, log-log)
    iso = IsotonicRegression(out_of_bounds="clip").fit(p_ens, y)
    p_cal = iso.predict(p_ens)
    fig, ax = plt.subplots(figsize=(4.2, 3.2))
    for p, label, marker in [(p_ens, "Uncalibrated ensemble", "o"), (p_cal, "After isotonic", "s")]:
        bins = pd.qcut(pd.Series(p), 12, duplicates="drop")
        g = pd.DataFrame({"p": p, "y": y}).groupby(bins, observed=True).mean()
        g = g[(g["p"] > 0) & (g["y"] > 0)]
        ax.plot(g["p"], g["y"], marker, markersize=3.5, linewidth=0.9, linestyle="-", label=label)
    lims = [1e-5, 1.0]
    ax.plot(lims, lims, color="gray", linewidth=0.8, linestyle=":")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Mean predicted probability (bin)")
    ax.set_ylabel("Observed ignition frequency")
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(OUT / "reliability.pdf")

    # Figure 3: ensemble-mean |SHAP| importances on a holdout sample
    sample = test.sample(min(40000, len(test)), random_state=0)
    sv = np.mean(
        [np.abs(shap.TreeExplainer(m).shap_values(sample[FEATURES])) for m in members], axis=0
    ).mean(axis=0)
    order = np.argsort(sv)
    fig, ax = plt.subplots(figsize=(4.2, 3.6))
    ax.barh([FEATURES[i] for i in order], sv[order], color="#d9622b")
    ax.set_xlabel("Mean |SHAP| (ensemble average)")
    fig.tight_layout()
    fig.savefig(OUT / "shap_importance.pdf")

    # Figure 4: per-year ROC-AUC bars per region from metrics.json
    fig, ax = plt.subplots(figsize=(4.6, 2.9))
    regions = ["portugal", "spain", "france"]
    colors = {"portugal": "#d9622b", "spain": "#8a3324", "france": "#3b6ea5"}
    width = 0.25
    years = ["2024", "2025", "2026"]
    for k, region in enumerate(regions):
        m = json.loads((REPO / "pipeline/models" / region / "metrics.json").read_text())
        vals = [m["by_year"].get(yr, {}).get("roc_auc", np.nan) for yr in years]
        ax.bar(np.arange(len(years)) + k * width, vals, width, label=region.capitalize(),
               color=colors[region])
    ax.set_xticks(np.arange(len(years)) + width)
    ax.set_xticklabels(years)
    ax.set_ylim(0.5, 1.0)
    ax.set_ylabel("ROC-AUC (held-out)")
    ax.legend(frameon=False, ncol=3)
    fig.tight_layout()
    fig.savefig(OUT / "by_year.pdf")

    print("figures written to", OUT)


if __name__ == "__main__":
    main()
