import type { Drivers } from "./types";

/** Plain-language labels for known model feature keys. Unknown keys fall back to the raw key. */
export const DRIVER_LABELS: Record<string, string> = {
  ndvi_mean: "Vegetation greenness (NDVI)",
  ndmi_mean: "Vegetation moisture (NDMI)",
  ndvi_anom: "Vegetation anomaly",
  tmax: "Max temperature",
  rh_min: "Minimum humidity",
  wind_max: "Peak wind",
  precip_sum: "Rain this week",
  precip_30d: "Rain, last 30 days",
  precip_90d: "Rain, last 90 days",
  elevation_m: "Elevation",
  slope_deg: "Terrain slope",
  tree_frac: "Tree cover",
  shrub_frac: "Shrub cover",
  grass_frac: "Grass cover",
  dist_powerline_m: "Distance to power line",
  week_sin: "Seasonality",
  week_cos: "Seasonality",
};

/**
 * Plain-language phrases keyed by the sign of the driver's contribution.
 * "up" = pushes risk higher, "down" = pulls risk lower.
 */
const DRIVER_PHRASES: Record<string, { up: string; down: string }> = {
  ndvi_mean: { up: "Abundant vegetation fuel", down: "Sparse vegetation fuel" },
  ndmi_mean: { up: "Very dry vegetation", down: "Vegetation still moist" },
  ndvi_anom: { up: "Vegetation stressed vs. normal", down: "Vegetation greener than normal" },
  tmax: { up: "High temperatures this week", down: "Mild temperatures this week" },
  rh_min: { up: "Very low humidity", down: "Humid conditions" },
  wind_max: { up: "High winds this week", down: "Light winds this week" },
  precip_sum: { up: "Little rain this week", down: "Rainfall this week" },
  precip_30d: { up: "Dry past month", down: "Wet past month" },
  precip_90d: { up: "Drought over past 3 months", down: "Wet past 3 months" },
  elevation_m: { up: "Elevation raises risk here", down: "Elevation lowers risk here" },
  slope_deg: { up: "Steep terrain", down: "Flat terrain" },
  tree_frac: { up: "Heavy tree cover", down: "Little tree cover" },
  shrub_frac: { up: "Flammable shrubland", down: "Little shrub cover" },
  grass_frac: { up: "Fine grass fuels", down: "Little grass cover" },
  dist_powerline_m: { up: "Power line proximity", down: "Far from power lines" },
  week_sin: { up: "Peak fire season", down: "Off fire season" },
  week_cos: { up: "Peak fire season", down: "Off fire season" },
};

export function driverLabel(key: string): string {
  return DRIVER_LABELS[key] ?? key;
}

export type DriverEntry = {
  key: string;
  label: string;
  /** Plain-language reading of this driver's push on risk. */
  phrase: string;
  /** Signed contribution as returned by the model. */
  value: number;
  /** |value| / max(|value|) across the shown set, 0-1. */
  weight: number;
};

/** Drivers sorted by absolute contribution, strongest first. */
export function rankDrivers(drivers: Drivers, limit?: number): DriverEntry[] {
  const entries = Object.entries(drivers)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const sliced = limit ? entries.slice(0, limit) : entries;
  const maxAbs = Math.max(...sliced.map(([, v]) => Math.abs(v)), 1e-9);
  return sliced.map(([key, value]) => {
    const phrases = DRIVER_PHRASES[key];
    const phrase = phrases
      ? value >= 0
        ? phrases.up
        : phrases.down
      : driverLabel(key);
    return {
      key,
      label: driverLabel(key),
      phrase,
      value,
      weight: Math.abs(value) / maxAbs,
    };
  });
}
