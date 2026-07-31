/**
 * Relative (percentile-based) risk scales.
 *
 * The scoring model ships calibrated probabilities: a cell's `p` is a true
 * weekly wildfire occurrence likelihood, so the maximum value in a week sits around
 * 0.02-0.06 rather than near 1. Tiers and color ramps therefore compare each
 * value against the distribution of the currently loaded week + jurisdiction
 * instead of absolute 0-1 cutoffs.
 */

export type TierLabel = "Severe" | "High" | "Elevated" | "Moderate";

export interface Tier {
  label: TierLabel;
  className: string;
}

/** Tier badges: dark text on soft tinted chips so they stay readable on light surfaces. */
const TIER_STYLES: Record<TierLabel, string> = {
  Severe: "bg-red-100 text-red-900 border-red-300",
  High: "bg-orange-100 text-orange-900 border-orange-300",
  Elevated: "bg-amber-100 text-amber-900 border-amber-300",
  Moderate: "bg-slate-100 text-slate-700 border-slate-300",
};

const MODERATE_TIER: Tier = { label: "Moderate", className: TIER_STYLES.Moderate };

/** Percentile cutoffs: Severe = top 2%, High = next 8%, Elevated = next 20%, Moderate = the rest. */
const SEVERE_Q = 0.98;
const HIGH_Q = 0.9;
const ELEVATED_Q = 0.7;

/** The ramp saturates at the week's 95th percentile so one outlier cannot wash out the map. */
const RAMP_TOP_Q = 0.95;

export interface WeekScale {
  /** Percentile tier of a raw value within this week's distribution. */
  tier: (value: number) => Tier;
  /** Ramp position 0-1: value / rampTop, clamped. Feed this to the color ramps. */
  normalize: (value: number) => number;
  /** Value at quantile q (0-1) of the week's distribution. */
  quantile: (q: number) => number;
  /** Raw value that maps to ramp position 1 (the week's p95, or its max if p95 is 0). */
  rampTop: number;
  /** How many values the scale was built from (0 = empty fallback scale). */
  size: number;
}

/** Everything renders as bottom-of-ramp Moderate until real values arrive. */
export const EMPTY_SCALE: WeekScale = {
  tier: () => MODERATE_TIER,
  normalize: () => 0,
  quantile: () => 0,
  rampTop: 0,
  size: 0,
};

function quantileOf(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const pos = Math.min(n - 1, Math.max(0, q * (n - 1)));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Build a relative scale from a week's raw values (cell probabilities or
 * corridor risks). Percentile-based throughout, so it works unchanged on any
 * positive value range.
 */
export function makeWeekScale(values: number[]): WeekScale {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return EMPTY_SCALE;

  const severeAt = quantileOf(sorted, SEVERE_Q);
  const highAt = quantileOf(sorted, HIGH_Q);
  const elevatedAt = quantileOf(sorted, ELEVATED_Q);
  const p95 = quantileOf(sorted, RAMP_TOP_Q);
  const rampTop = p95 > 0 ? p95 : sorted[n - 1];

  return {
    tier: (value: number): Tier => {
      const label: TierLabel =
        value >= severeAt
          ? "Severe"
          : value >= highAt
            ? "High"
            : value >= elevatedAt
              ? "Elevated"
              : "Moderate";
      return { label, className: TIER_STYLES[label] };
    },
    normalize: (value: number): number =>
      rampTop > 0 ? Math.min(1, Math.max(0, value / rampTop)) : 0,
    quantile: (q: number): number => quantileOf(sorted, q),
    rampTop,
    size: n,
  };
}

export interface SpreadAgreement {
  label: "High" | "Medium" | "Low";
  sentence: string;
}

/**
 * Ensemble spread `s` (member disagreement, roughly 0-0.1) folded into a
 * plain-language agreement rating for the advanced panel.
 */
export function spreadAgreement(s: number): SpreadAgreement {
  if (s < 0.01) {
    return {
      label: "High",
      sentence: "The ensemble's five models agree about this cell.",
    };
  }
  if (s <= 0.05) {
    return {
      label: "Medium",
      sentence: "The ensemble's five models broadly agree about this cell.",
    };
  }
  return {
    label: "Low",
    sentence:
      "The ensemble's five models disagree about this cell, so read this estimate with extra caution.",
  };
}
