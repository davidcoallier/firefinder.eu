"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { fetchCells, fetchFires, fetchSegments, fetchWeeks } from "@/lib/api";
import {
  getBasemapSnapshot,
  getServerBasemapSnapshot,
  setBasemapMode,
  subscribeBasemap,
  type BasemapMode,
} from "@/lib/basemap";
import { geometryBounds } from "@/lib/colors";
import {
  fetchLiveFires,
  getLiveFiresSnapshot,
  getServerLiveFiresSnapshot,
  LIVE_FIRES_REFRESH_MS,
  setLiveFiresEnabled,
  subscribeLiveFires,
} from "@/lib/liveFires";
import {
  DEFAULT_JURISDICTION,
  JURISDICTIONS,
  type Jurisdiction,
} from "@/lib/regions";
import type {
  Cell,
  FireCollection,
  LiveFireCollection,
  LiveFireFeature,
  SegmentCollection,
  SegmentFeature,
  Selection,
} from "@/lib/types";
import AdvancedControls from "./AdvancedControls";
import BasemapToggle from "./BasemapToggle";
import EmptyState from "./EmptyState";
import Header, { type Mode } from "./Header";
import Legend from "./Legend";
import LiveFireCard from "./LiveFireCard";
import type { MapFocus } from "./MapView";
import SidePanel from "./SidePanel";
import WeekSelector from "./WeekSelector";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

/** Cells below this are hidden by default so the map isn't carpeted. */
const DEFAULT_THRESHOLD = 0.05;

export default function App() {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>(DEFAULT_JURISDICTION);
  const regionId = jurisdiction.dataRegionId;

  const [mode, setMode] = useState<Mode>("simple");
  // Persisted preference lives in a small external store (see lib/basemap):
  // SSR renders "satellite", the stored choice takes over on the client.
  const basemap = useSyncExternalStore(
    subscribeBasemap,
    getBasemapSnapshot,
    getServerBasemapSnapshot
  );
  const [toast, setToast] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<string[] | null>(null); // null = loading
  const [week, setWeek] = useState<string | null>(null);
  const [weekData, setWeekData] = useState<{
    week: string;
    cells: Cell[];
    segments: SegmentCollection | null;
  } | null>(null);
  const [fires, setFires] = useState<FireCollection | null>(null);
  // NASA FIRMS detections from the last 24h. Preference persists like basemap.
  const liveFiresOn = useSyncExternalStore(
    subscribeLiveFires,
    getLiveFiresSnapshot,
    getServerLiveFiresSnapshot
  );
  const [liveFires, setLiveFires] = useState<LiveFireCollection | null>(null);
  const [liveFire, setLiveFire] = useState<LiveFireFeature | null>(null);
  // Full grid network (static asset) — gray context under the ranked corridors.
  const [gridContext, setGridContext] = useState<GeoJSON.FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const [showCells, setShowCells] = useState(true);
  const [showSegments, setShowSegments] = useState(true);
  const [showFires, setShowFires] = useState(false);
  // Soft default so the basemap shows through the risk cells.
  const [cellOpacity, setCellOpacity] = useState(0.45);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);

  // Load available weeks + historical fires once per jurisdiction.
  useEffect(() => {
    let cancelled = false;
    fetchWeeks(regionId)
      .then((ws) => {
        if (cancelled) return;
        setWeeks(ws);
        setWeek(ws[0] ?? null);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setWeeks([]);
        setError(e instanceof Error ? e.message : String(e));
      });
    fetchFires(regionId)
      .then((fc) => {
        if (!cancelled) setFires(fc);
      })
      .catch(() => {
        /* fires are a non-critical overlay */
      });
    fetch(`/basemap/grid-${regionId}.geojson`)
      .then((r) => (r.ok ? r.json() : null))
      .then((fc: GeoJSON.FeatureCollection | null) => {
        if (!cancelled) setGridContext(fc);
      })
      .catch(() => {
        /* context layer is optional */
      });
    return () => {
      cancelled = true;
    };
  }, [regionId]);

  // Live fires: fetch per jurisdiction and refresh every 15 minutes while
  // the page is open (the FIRMS feeds behind /api/live-fires update with
  // ~3h latency, so more frequent polling would gain nothing).
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchLiveFires(jurisdiction.bbox)
        .then((fc) => {
          if (!cancelled) setLiveFires(fc);
        })
        .catch(() => {
          /* live fires are a non-critical overlay */
        });
    };
    load();
    const timer = setInterval(load, LIVE_FIRES_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jurisdiction]);

  // Load cells + segments whenever the selected week changes.
  useEffect(() => {
    if (!week) return;
    let cancelled = false;
    Promise.all([fetchCells(regionId, week), fetchSegments(regionId, week)])
      .then(([cs, segs]) => {
        if (cancelled) return;
        setWeekData({ week, cells: cs, segments: segs });
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setWeekData({ week, cells: [], segments: null });
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [regionId, week]);

  // Auto-dismiss the basemap toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const cells = weekData?.cells ?? [];
  const segments = weekData?.segments ?? null;
  const weekLoading = week !== null && weekData?.week !== week;

  const handleWeekChange = useCallback((w: string) => {
    setWeek(w);
    setSelection(null);
  }, []);

  const handleJurisdictionChange = useCallback((j: Jurisdiction) => {
    setJurisdiction(j);
    // Reset per-jurisdiction data so the switch shows a clean loading state
    // while the effects above refetch weeks / cells / segments / fires.
    setWeeks(null);
    setWeek(null);
    setWeekData(null);
    setFires(null);
    setLiveFires(null);
    setLiveFire(null);
    setGridContext(null);
    setSelection(null);
    setFocus(null);
    setError(null);
  }, []);

  const handleLiveFiresToggle = useCallback((on: boolean) => {
    setLiveFiresEnabled(on);
    if (!on) setLiveFire(null); // don't leave a card up for a hidden layer
  }, []);

  const handleSelectSegmentFromList = useCallback((feature: SegmentFeature) => {
    setSelection({ kind: "segment", feature });
    const bounds = geometryBounds(feature.geometry);
    if (bounds) setFocus({ bounds, key: Date.now() });
  }, []);

  const handleBasemapChange = useCallback((m: BasemapMode) => {
    setBasemapMode(m);
    setToast(null);
  }, []);

  // Satellite tiles repeatedly failed (ad-blocker / offline): fall back to the
  // self-contained plain basemap. Deliberately not persisted, so the user's
  // stored preference survives a flaky session.
  const handleSatelliteFailure = useCallback(() => {
    if (getBasemapSnapshot() !== "satellite") return;
    setBasemapMode("plain", { persist: false });
    setToast(
      "Satellite imagery couldn't load (possibly blocked by an extension) — switched to the plain map."
    );
  }, []);

  const pipelineEmpty = weeks !== null && weeks.length === 0;

  const liveFireCount = liveFires?.features.length ?? 0;
  const liveFiresLabel =
    liveFireCount > 0 ? `Live fires (24h) · ${liveFireCount}` : "Live fires (24h)";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-100 text-slate-800">
      <Header
        jurisdictions={JURISDICTIONS}
        jurisdiction={jurisdiction}
        onJurisdictionChange={handleJurisdictionChange}
        mode={mode}
        onModeChange={setMode}
      />

      <div className="relative min-h-0 flex-1">
        <MapView
          region={jurisdiction}
          basemap={basemap}
          onSatelliteFailure={handleSatelliteFailure}
          cells={cells}
          segments={segments}
          fires={fires}
          liveFires={liveFires}
          gridContext={gridContext}
          showCells={showCells}
          showSegments={showSegments}
          showFires={mode === "advanced" && showFires}
          showLiveFires={liveFiresOn}
          onSelectLiveFire={setLiveFire}
          cellOpacity={cellOpacity}
          threshold={threshold}
          selection={selection}
          onSelect={setSelection}
          focus={focus}
        />

        {pipelineEmpty && (
          <EmptyState
            jurisdictionLabel={jurisdiction.label}
            liveJurisdictionLabel={
              jurisdiction.id !== DEFAULT_JURISDICTION.id
                ? DEFAULT_JURISDICTION.label
                : undefined
            }
          />
        )}

        {!pipelineEmpty && (
          <aside className="absolute bottom-0 left-0 top-0 z-10 flex w-[22.5rem] flex-col border-r border-slate-200 bg-white/92 backdrop-blur-md">
            {mode === "simple" && (
              <p className="border-b border-slate-200 bg-orange-50/80 px-4 py-2.5 text-[13px] leading-snug text-slate-700">
                Each line is a power corridor. Redder = higher wildfire risk
                this week.
              </p>
            )}
            <div className="border-b border-slate-200 px-4 pb-2 pt-3">
              {weeks === null ? (
                <p className="pb-1 text-sm text-slate-500">Loading weeks…</p>
              ) : (
                <WeekSelector
                  weeks={weeks}
                  selected={week}
                  onSelect={handleWeekChange}
                />
              )}
              {/* In advanced mode this toggle lives with the layer controls. */}
              {mode === "simple" && (
                <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={liveFiresOn}
                    onChange={(e) => handleLiveFiresToggle(e.target.checked)}
                    className="h-3 w-3 accent-orange-600"
                  />
                  {liveFiresLabel}
                </label>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <SidePanel
                mode={mode}
                segments={segments?.features ?? []}
                loading={weekLoading}
                selection={selection}
                onSelectSegment={handleSelectSegmentFromList}
                onClearSelection={() => setSelection(null)}
              />
            </div>
          </aside>
        )}

        {/* Basemap switcher: bottom-left map corner, clear of the side panel
            and above maplibre's attribution control in stacking order. */}
        <div
          className={`absolute bottom-3 z-10 ${
            pipelineEmpty ? "left-3" : "left-[23.5rem]"
          }`}
        >
          <BasemapToggle mode={basemap} onChange={handleBasemapChange} />
        </div>

        {mode === "advanced" && !pipelineEmpty && (
          <div className="pointer-events-none absolute right-3 top-3 z-10">
            <AdvancedControls
              toggles={[
                { label: "Risk cells", checked: showCells, onChange: setShowCells },
                { label: "Corridors", checked: showSegments, onChange: setShowSegments },
                { label: "Historical fires", checked: showFires, onChange: setShowFires },
                {
                  label: liveFiresLabel,
                  checked: liveFiresOn,
                  onChange: handleLiveFiresToggle,
                },
              ]}
              cellOpacity={cellOpacity}
              onCellOpacity={setCellOpacity}
              threshold={threshold}
              onThreshold={setThreshold}
            />
          </div>
        )}

        {/* Bottom-right stack: live-fire info card above the legend. */}
        <div className="pointer-events-none absolute bottom-8 right-3 z-10 flex flex-col items-end gap-2">
          {liveFire && (
            <LiveFireCard feature={liveFire} onClose={() => setLiveFire(null)} />
          )}
          {!pipelineEmpty && <Legend compact={mode === "simple"} />}
        </div>

        {toast && (
          <div className="absolute bottom-14 left-1/2 z-20 -translate-x-1/2 rounded-md border border-slate-300 bg-white/95 px-3 py-1.5 text-sm text-slate-700 shadow-lg">
            {toast}
          </div>
        )}

        {error && (
          <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-800 shadow-lg">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
