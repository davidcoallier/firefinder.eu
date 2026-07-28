import { NextResponse, type NextRequest } from "next/server";
import type { LiveFireCollection, LiveFireFeature } from "@/lib/types";

/**
 * Live active-fire detections from NASA FIRMS (keyless public CSV feeds).
 *
 * `GET /api/live-fires?bbox=w,s,e,n&region=europe` returns the last ~24h of
 * VIIRS detections inside the bbox as a GeoJSON FeatureCollection of Points.
 * The feeds update a few times a day with ~3h latency, so upstream fetches
 * are cached with 15-minute revalidation (Next's fetch data cache). This
 * overlay is non-critical: if both feeds fail we return an empty collection
 * with 200 rather than erroring the UI.
 */

type Bbox = [number, number, number, number];

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire";

type Feed = { url: string; satellite: string };

/**
 * Feeds per region id. To add the US later:
 *   usa: [ ...SUOMI_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv,
 *          ...J1_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv ]
 */
const REGION_FEEDS: Record<string, Feed[]> = {
  europe: [
    {
      url: `${FIRMS_BASE}/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Europe_24h.csv`,
      satellite: "Suomi NPP",
    },
    {
      url: `${FIRMS_BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Europe_24h.csv`,
      satellite: "NOAA-20",
    },
  ],
};

function parseBbox(raw: string | null): Bbox | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [w, s, e, n] = parts;
  if (w >= e || s >= n) return null;
  return [w, s, e, n];
}

/** "0253" -> "02:53 UTC" */
function formatAcqTime(hhmm: string): string {
  const t = hhmm.trim().padStart(4, "0");
  return `${t.slice(0, 2)}:${t.slice(2, 4)} UTC`;
}

/**
 * Parse one FIRMS CSV feed into features inside the bbox. Columns are looked
 * up by header name so column reordering upstream can't silently misparse;
 * malformed rows are skipped.
 */
function parseFeedCsv(
  csv: string,
  satellite: string,
  bbox: Bbox
): LiveFireFeature[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const iLat = header.indexOf("latitude");
  const iLon = header.indexOf("longitude");
  const iBright = header.indexOf("bright_ti4");
  const iDate = header.indexOf("acq_date");
  const iTime = header.indexOf("acq_time");
  const iConf = header.indexOf("confidence");
  const iFrp = header.indexOf("frp");
  const iDayNight = header.indexOf("daynight");
  if (iLat < 0 || iLon < 0 || iDate < 0 || iTime < 0) return [];

  const [w, s, e, n] = bbox;
  const features: LiveFireFeature[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const lat = Number(cells[iLat]);
    const lon = Number(cells[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    const frp = Number(cells[iFrp]);
    const brightness = Number(cells[iBright]);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        acq_date: cells[iDate] ?? "",
        acq_time: formatAcqTime(cells[iTime] ?? ""),
        satellite,
        confidence: cells[iConf]?.trim() ?? "unknown",
        frp: Number.isFinite(frp) ? frp : 0,
        brightness: Number.isFinite(brightness) ? brightness : 0,
        daynight: cells[iDayNight]?.trim() ?? "",
      },
    });
  }
  return features;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const bbox = parseBbox(searchParams.get("bbox"));
  if (!bbox) {
    return NextResponse.json(
      { error: "bbox=w,s,e,n query parameter is required" },
      { status: 400 }
    );
  }

  const region = searchParams.get("region") ?? "europe";
  const feeds = REGION_FEEDS[region];
  if (!feeds) {
    return NextResponse.json(
      { error: `unknown region "${region}"` },
      { status: 400 }
    );
  }

  // Fetch feeds in parallel; a failing feed degrades to its siblings only.
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const res = await fetch(feed.url, { next: { revalidate: 900 } });
      if (!res.ok) throw new Error(`${feed.url} -> HTTP ${res.status}`);
      return parseFeedCsv(await res.text(), feed.satellite, bbox);
    })
  );

  const features: LiveFireFeature[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") features.push(...r.value);
    else console.error("live-fires feed failed:", r.reason);
  }

  const collection: LiveFireCollection = { type: "FeatureCollection", features };
  return NextResponse.json(collection);
}
