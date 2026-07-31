import type { BasemapMode } from "./basemap";
import type { Geometry } from "./types";

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Fire risk ramp: amber -> red-orange -> dark crimson. Takes a NORMALIZED
 * ramp position 0-1 (see WeekScale.normalize), not a raw probability:
 * calibrated weekly wildfire occurrence probabilities top out at a few percent, so the
 * ramp spans this week's distribution instead. The visible end starts at
 * amber (pale yellow vanishes on white) and the severe end goes dark so it
 * still reads against light terrain. sqrt scaling lifts the low end so
 * sparse low-position cells are visible. On the satellite basemap the alpha
 * floor is raised so faint hexes stay visible over busy imagery.
 */
export function riskColor(
  position: number,
  opacity = 1,
  basemap: BasemapMode = "plain"
): [number, number, number, number] {
  const t = Math.sqrt(clamp01(position));
  // amber (245,158,11) -> red-orange (220,70,25) -> dark crimson (140,15,35)
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const u = t / 0.5;
    r = lerp(245, 220, u);
    g = lerp(158, 70, u);
    b = lerp(11, 25, u);
  } else {
    const u = (t - 0.5) / 0.5;
    r = lerp(220, 140, u);
    g = lerp(70, 15, u);
    b = lerp(25, 35, u);
  }
  const alphaFloor = basemap === "satellite" ? 90 : 55;
  const a = (alphaFloor + (240 - alphaFloor) * t) * clamp01(opacity);
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(a)];
}

/** Corridors below this normalized ramp position render as neutral context, not part of the ramp. */
export const CORRIDOR_RAMP_FLOOR = 0.35;

/**
 * Corridor line color: takes a NORMALIZED ramp position 0-1 (see
 * WeekScale.normalize), not a raw risk value. Below the floor, a thin
 * neutral line so low-position corridors read as context - gray on the plain
 * basemap, light on dark satellite imagery; above it, a colorblind-safer
 * amber-yellow -> orange -> crimson ramp that works on both.
 */
export function corridorColor(
  position: number,
  basemap: BasemapMode = "plain"
): [number, number, number, number] {
  if (position < CORRIDOR_RAMP_FLOOR) {
    return basemap === "satellite" ? [235, 238, 242, 140] : [120, 125, 135, 90];
  }
  const t = (clamp01(position) - CORRIDOR_RAMP_FLOOR) / (1 - CORRIDOR_RAMP_FLOOR);
  // amber-yellow (217,160,0) -> orange (234,88,12) -> crimson (153,27,27)
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const u = t / 0.5;
    r = lerp(217, 234, u);
    g = lerp(160, 88, u);
    b = lerp(0, 12, u);
  } else {
    const u = (t - 0.5) / 0.5;
    r = lerp(234, 153, u);
    g = lerp(88, 27, u);
    b = lerp(12, 27, u);
  }
  return [Math.round(r), Math.round(g), Math.round(b), 235];
}

/** Corridor line width in px from normalized ramp position: low lines stay thin, top corridors are clearly thickest. */
export function corridorWidth(position: number): number {
  if (position < CORRIDOR_RAMP_FLOOR) return 1.2;
  const t = (clamp01(position) - CORRIDOR_RAMP_FLOOR) / (1 - CORRIDOR_RAMP_FLOOR);
  return 2 + t * 4.5;
}

/** CSS color at a normalized ramp position 0-1. */
export function riskColorCss(position: number): string {
  const [r, g, b] = riskColor(position, 1);
  return `rgb(${r} ${g} ${b})`;
}

/** CSS gradient matching the risk ramp (over normalized positions), for legends and badges. */
export function riskGradientCss(): string {
  const stops = [0.02, 0.1, 0.25, 0.5, 0.75, 1].map(
    (t) => `${riskColorCss(t)} ${Math.round(t * 100)}%`
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Map selection highlight: deep blue - distinct from the warm risk ramp and legible on a light basemap. */
export const ACCENT_SELECT: [number, number, number, number] = [37, 99, 235, 255];

/** Walk arbitrarily nested GeoJSON coordinates and accumulate a lon/lat bbox. */
export function geometryBounds(
  geometry: Geometry
): [[number, number], [number, number]] | null {
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;

  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      const lon = node[0] as number;
      const lat = node[1] as number;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const child of node) visit(child);
  };
  visit(geometry?.coordinates);

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

/**
 * Format a calibrated probability honestly at small magnitudes: enough
 * precision that a nonzero value never reads as "0%".
 */
export function formatProb(p: number): string {
  if (!(p > 0)) return "0%";
  const pct = p * 100;
  if (pct >= 10) return `${pct.toFixed(0)}%`;
  if (pct >= 0.1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return "<0.01%";
}

export function formatLength(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return "-";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
