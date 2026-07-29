import type { LiveFireCollection } from "./types";

/**
 * Live-fires overlay preference + data fetching (NASA FIRMS via
 * /api/live-fires). The on/off preference mirrors lib/basemap: a tiny
 * external store consumed through useSyncExternalStore, so the server
 * snapshot (default ON) renders first and the localStorage-backed value
 * takes over on the client without a hydration mismatch or a
 * setState-in-effect.
 */

const LIVE_FIRES_STORAGE_KEY = "firefinder.liveFires";

/** How often the overlay refetches while the page stays open. */
export const LIVE_FIRES_REFRESH_MS = 15 * 60 * 1000;

function readStoredEnabled(): boolean | null {
  try {
    const v = window.localStorage.getItem(LIVE_FIRES_STORAGE_KEY);
    return v === "on" ? true : v === "off" ? false : null;
  } catch {
    return null;
  }
}

let liveFiresEnabled: boolean | null = null; // null until first client read
const listeners = new Set<() => void>();

export function subscribeLiveFires(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLiveFiresSnapshot(): boolean {
  if (liveFiresEnabled === null) liveFiresEnabled = readStoredEnabled() ?? true;
  return liveFiresEnabled;
}

export function getServerLiveFiresSnapshot(): boolean {
  return true; // default ON
}

export function setLiveFiresEnabled(on: boolean): void {
  if (on === liveFiresEnabled) return;
  liveFiresEnabled = on;
  try {
    window.localStorage.setItem(LIVE_FIRES_STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* private mode / storage disabled - preference just won't persist */
  }
  for (const listener of listeners) listener();
}

/** Fetch last-24h detections inside a bbox [minLon, minLat, maxLon, maxLat]. */
export async function fetchLiveFires(
  bbox: [number, number, number, number],
  region = "europe"
): Promise<LiveFireCollection> {
  const res = await fetch(
    `/api/live-fires?bbox=${bbox.join(",")}&region=${region}`
  );
  if (!res.ok) throw new Error(`live-fires failed: HTTP ${res.status}`);
  return (await res.json()) as LiveFireCollection;
}
