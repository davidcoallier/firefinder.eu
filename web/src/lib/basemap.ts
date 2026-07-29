import type { StyleSpecification } from "maplibre-gl";

/**
 * Two self-built basemap modes (no external style.json, so no dependency on
 * CDN-hosted styles that ad-blockers may break):
 *
 * - "satellite": Esri World Imagery raster tiles (default).
 * - "plain": fully offline - background ocean + local countries.geojson.
 */
export type BasemapMode = "satellite" | "plain";

export const SATELLITE_SOURCE_ID = "satellite";

const BASEMAP_STORAGE_KEY = "firefinder.basemap";

function readStoredBasemap(): BasemapMode | null {
  try {
    const v = window.localStorage.getItem(BASEMAP_STORAGE_KEY);
    return v === "satellite" || v === "plain" ? v : null;
  } catch {
    return null;
  }
}

/*
 * Tiny external store for the basemap preference, consumed from React via
 * useSyncExternalStore: the server snapshot is always "satellite" and the
 * localStorage-backed value kicks in on the client without a hydration
 * mismatch or a setState-in-effect.
 */
let basemapMode: BasemapMode | null = null; // null until first client read
const basemapListeners = new Set<() => void>();

export function subscribeBasemap(listener: () => void): () => void {
  basemapListeners.add(listener);
  return () => basemapListeners.delete(listener);
}

export function getBasemapSnapshot(): BasemapMode {
  if (basemapMode === null) basemapMode = readStoredBasemap() ?? "satellite";
  return basemapMode;
}

export function getServerBasemapSnapshot(): BasemapMode {
  return "satellite";
}

/**
 * Switch basemap mode. `persist: false` is for automatic fallbacks (satellite
 * tiles failing) so they don't clobber the user's stored preference.
 */
export function setBasemapMode(
  mode: BasemapMode,
  { persist = true }: { persist?: boolean } = {}
): void {
  if (mode === basemapMode) return;
  basemapMode = mode;
  if (persist) {
    try {
      window.localStorage.setItem(BASEMAP_STORAGE_KEY, mode);
    } catch {
      /* private mode / storage disabled - preference just won't persist */
    }
  }
  for (const listener of basemapListeners) listener();
}

function coverageGeoJson(
  bbox: [number, number, number, number]
): GeoJSON.Feature {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ],
      ],
    },
  };
}

/**
 * Build the maplibre style for a basemap mode as a plain JS object.
 *
 * When `coverageBbox` is given, a dashed outline of the monitored-coverage
 * area is baked into the style. Callers switch modes / jurisdictions with
 * `map.setStyle(buildMapStyle(...))` - maplibre's default style-diffing turns
 * a coverage-only change into a cheap add/remove of that one source + layer.
 */
export function buildMapStyle(
  mode: BasemapMode,
  coverageBbox?: [number, number, number, number]
): StyleSpecification {
  const style: StyleSpecification =
    mode === "satellite"
      ? {
          version: 8,
          sources: {
            [SATELLITE_SOURCE_ID]: {
              type: "raster",
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              maxzoom: 19,
              attribution: "Esri, Maxar, Earthstar Geographics",
            },
          },
          layers: [
            {
              id: "satellite-imagery",
              type: "raster",
              source: SATELLITE_SOURCE_ID,
            },
          ],
        }
      : {
          version: 8,
          sources: {},
          layers: [
            {
              id: "ocean",
              type: "background",
              paint: { "background-color": "#d9e5ee" },
            },
          ],
        };

  if (coverageBbox) {
    style.sources["coverage"] = {
      type: "geojson",
      data: coverageGeoJson(coverageBbox),
    };
    style.layers.push({
      id: "coverage-outline",
      type: "line",
      source: "coverage",
      paint: {
        "line-color": mode === "satellite" ? "#e2e8f0" : "#64748b",
        "line-width": 1.5,
        "line-opacity": mode === "satellite" ? 0.65 : 0.5,
        "line-dasharray": [3, 2.5],
      },
    });
  }

  return style;
}
