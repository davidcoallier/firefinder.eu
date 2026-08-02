import { latLngToCell } from "h3-js";
import type {
  Geometry,
  LiveFireCollection,
  SegmentCollection,
  SegmentProperties,
} from "./types";

/**
 * Active fire status derived from live NASA FIRMS detections.
 *
 * Design decision: live detections never alter forecast scores. They become a
 * STATUS that supersedes the tier presentation where reality has overtaken
 * the forecast. A hexagon that is burning must never read as plain
 * "Moderate", so the map and panels consult these lookups on top of the
 * unchanged weekly scores.
 */

/** H3 resolution of the forecast grid cells. */
const CELL_RESOLUTION = 7;

/** A corridor is flagged when a detection sits within this many meters of it. */
export const CORRIDOR_FIRE_RADIUS_M = 1500;

/**
 * Bounding-box margin (degrees) used to prefilter detections per segment
 * before the exact point-to-polyline distance. ~0.02 degrees comfortably
 * covers the 1500 m radius at Iberian latitudes.
 */
const BBOX_MARGIN_DEG = 0.02;

/** Meters per degree of latitude (spherical approximation). */
const M_PER_DEG_LAT = 111_320;

/**
 * H3 indexes (forecast-grid resolution) containing at least one live
 * detection. Null fires means no data yet: an empty set, so nothing on the
 * map changes.
 */
export function activeCellSet(fires: LiveFireCollection | null): Set<string> {
  const set = new Set<string>();
  if (!fires) return set;
  for (const f of fires.features) {
    const coords = f.geometry.coordinates as [number, number];
    if (!Array.isArray(coords)) continue;
    const [lng, lat] = coords;
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    set.add(latLngToCell(lat, lng, CELL_RESOLUTION));
  }
  return set;
}

/** A lon/lat position pair as found in GeoJSON coordinates. */
type Position = [number, number];

/**
 * Collect the line strings of a (Multi)LineString geometry, tolerating any
 * nesting depth since Geometry.coordinates is typed as unknown.
 */
function collectLines(geometry: Geometry): Position[][] {
  const lines: Position[][] = [];
  const isPosition = (node: unknown): node is Position =>
    Array.isArray(node) &&
    node.length >= 2 &&
    typeof node[0] === "number" &&
    typeof node[1] === "number";

  const visit = (node: unknown): void => {
    if (!Array.isArray(node) || node.length === 0) return;
    if (isPosition(node[0])) {
      lines.push(node as Position[]);
      return;
    }
    for (const child of node) visit(child);
  };
  visit(geometry?.coordinates);
  return lines;
}

/**
 * Squared distance (meters) from point p to the segment a-b, all given in
 * a local equirectangular projection (meters). Squared to avoid sqrt in the
 * inner loop.
 */
function pointSegmentDistSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.min(1, Math.max(0, t));
  }
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/**
 * Map from segment id to the distance in meters of the nearest live
 * detection within CORRIDOR_FIRE_RADIUS_M of that segment. Segments with no
 * nearby detection are absent from the map.
 *
 * Detections are prefiltered per segment by an expanded bounding box, so
 * thousands of segments against hundreds of detections stays fast. Distances
 * use an equirectangular approximation, which is accurate to well under a
 * percent at these ranges.
 */
export function corridorFireProximity(
  fires: LiveFireCollection | null,
  segments: SegmentCollection | null
): Map<SegmentProperties["id"], number> {
  const result = new Map<SegmentProperties["id"], number>();
  if (!fires || !segments || fires.features.length === 0) return result;

  const points: Position[] = [];
  for (const f of fires.features) {
    const coords = f.geometry.coordinates as [number, number];
    if (
      Array.isArray(coords) &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      points.push([coords[0], coords[1]]);
    }
  }
  if (points.length === 0) return result;

  const radiusSq = CORRIDOR_FIRE_RADIUS_M * CORRIDOR_FIRE_RADIUS_M;

  for (const segment of segments.features) {
    const lines = collectLines(segment.geometry);
    if (lines.length === 0) continue;

    // Segment bbox, expanded by the prefilter margin.
    let minLon = Infinity,
      minLat = Infinity,
      maxLon = -Infinity,
      maxLat = -Infinity;
    for (const line of lines) {
      for (const [lon, lat] of line) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    minLon -= BBOX_MARGIN_DEG;
    maxLon += BBOX_MARGIN_DEG;
    minLat -= BBOX_MARGIN_DEG;
    maxLat += BBOX_MARGIN_DEG;

    const nearby = points.filter(
      ([lon, lat]) =>
        lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
    );
    if (nearby.length === 0) continue;

    // Local equirectangular projection around the segment's mid-latitude.
    const midLat = (minLat + maxLat) / 2;
    const mPerDegLon = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
    const project = ([lon, lat]: Position): [number, number] => [
      lon * mPerDegLon,
      lat * M_PER_DEG_LAT,
    ];

    let bestSq = Infinity;
    for (const point of nearby) {
      const [px, py] = project(point);
      for (const line of lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const [ax, ay] = project(line[i]);
          const [bx, by] = project(line[i + 1]);
          const dSq = pointSegmentDistSq(px, py, ax, ay, bx, by);
          if (dSq < bestSq) bestSq = dSq;
        }
      }
    }
    if (bestSq <= radiusSq) {
      result.set(segment.properties.id, Math.sqrt(bestSq));
    }
  }
  return result;
}

/**
 * Human distance for the status copy: "~600 m". Rounds to a sensible step so
 * the number does not overstate the ~375 m precision of the detections.
 */
export function formatFireDistance(meters: number): string {
  const step = meters < 200 ? 10 : 50;
  return `~${Math.max(step, Math.round(meters / step) * step)} m`;
}
