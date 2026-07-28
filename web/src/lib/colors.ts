import type { Geometry } from "./types";

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Fire risk ramp: transparent -> amber -> deep red.
 * sqrt scaling lifts the low-probability end so sparse ignition
 * probabilities are still visible.
 */
export function riskColor(
  p: number,
  opacity = 1
): [number, number, number, number] {
  const t = Math.sqrt(clamp01(p));
  // amber (255,179,0) -> red (255,72,20) -> crimson (220,20,40)
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const u = t / 0.5;
    r = 255;
    g = lerp(179, 72, u);
    b = lerp(0, 20, u);
  } else {
    const u = (t - 0.5) / 0.5;
    r = lerp(255, 225, u);
    g = lerp(72, 24, u);
    b = lerp(20, 46, u);
  }
  const a = (30 + 195 * t) * clamp01(opacity);
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(a)];
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

export const ACCENT_CYAN: [number, number, number, number] = [64, 224, 255, 255];

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

export function riskTier(risk: number): { label: string; className: string } {
  if (risk >= 0.7) return { label: "Severe", className: "bg-red-500/20 text-red-300 border-red-500/40" };
  if (risk >= 0.4) return { label: "High", className: "bg-orange-500/20 text-orange-300 border-orange-500/40" };
  if (risk >= 0.15) return { label: "Elevated", className: "bg-amber-500/20 text-amber-300 border-amber-500/40" };
  return { label: "Moderate", className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" };
}
