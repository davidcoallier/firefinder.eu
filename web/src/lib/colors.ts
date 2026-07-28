import type { BasemapMode } from "./basemap";
import type { Geometry } from "./types";

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Fire risk ramp: amber -> red-orange -> dark crimson. The visible end starts
 * at amber (pale yellow vanishes on white) and the severe end goes dark so it
 * still reads against light terrain. sqrt scaling lifts the low-probability
 * end so sparse ignition probabilities are visible. On the satellite basemap
 * the alpha floor is raised so faint hexes stay visible over busy imagery.
 */
export function riskColor(
  p: number,
  opacity = 1,
  basemap: BasemapMode = "plain"
): [number, number, number, number] {
  const t = Math.sqrt(clamp01(p));
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

/** Corridors below this risk render as neutral context, not part of the ramp. */
export const CORRIDOR_RISK_FLOOR = 0.35;

/**
 * Corridor line color: below the floor, a thin neutral line so low-risk
 * corridors read as context — gray on the plain basemap, light on dark
 * satellite imagery; above it, a colorblind-safer amber-yellow -> orange ->
 * crimson ramp that works on both.
 */
export function corridorColor(
  risk: number,
  basemap: BasemapMode = "plain"
): [number, number, number, number] {
  if (risk < CORRIDOR_RISK_FLOOR) {
    return basemap === "satellite" ? [235, 238, 242, 140] : [120, 125, 135, 90];
  }
  const t = (clamp01(risk) - CORRIDOR_RISK_FLOOR) / (1 - CORRIDOR_RISK_FLOOR);
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

/** Corridor line width in px: low-risk lines stay thin, top corridors are clearly thickest. */
export function corridorWidth(risk: number): number {
  if (risk < CORRIDOR_RISK_FLOOR) return 1.2;
  const t = (clamp01(risk) - CORRIDOR_RISK_FLOOR) / (1 - CORRIDOR_RISK_FLOOR);
  return 2 + t * 4.5;
}

export function riskColorCss(p: number): string {
  const [r, g, b] = riskColor(p, 1);
  return `rgb(${r} ${g} ${b})`;
}

/** CSS gradient matching the risk ramp, for legends and badges. */
export function riskGradientCss(): string {
  const stops = [0.02, 0.1, 0.25, 0.5, 0.75, 1].map(
    (p) => `${riskColorCss(p)} ${Math.round(p * 100)}%`
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Map selection highlight: deep blue — distinct from the warm risk ramp and legible on a light basemap. */
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

export function formatPct(p: number): string {
  const pct = p * 100;
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

export function formatLength(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/** Tier badges: dark text on soft tinted chips so they stay readable on light surfaces. */
export function riskTier(risk: number): { label: string; className: string } {
  if (risk >= 0.7) return { label: "Severe", className: "bg-red-100 text-red-900 border-red-300" };
  if (risk >= 0.4) return { label: "High", className: "bg-orange-100 text-orange-900 border-orange-300" };
  if (risk >= 0.15) return { label: "Elevated", className: "bg-amber-100 text-amber-900 border-amber-300" };
  return { label: "Moderate", className: "bg-slate-100 text-slate-700 border-slate-300" };
}
