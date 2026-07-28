"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { fetchCells, fetchFires, fetchSegments, fetchWeeks } from "@/lib/api";
import { geometryBounds } from "@/lib/colors";
import { DEFAULT_REGION } from "@/lib/regions";
import type {
  Cell,
  FireCollection,
  SegmentCollection,
  SegmentFeature,
  Selection,
} from "@/lib/types";
import AdvancedControls from "./AdvancedControls";
import EmptyState from "./EmptyState";
import Header, { type Mode } from "./Header";
import Legend from "./Legend";
import type { MapFocus } from "./MapView";
import SidePanel from "./SidePanel";
import WeekSelector from "./WeekSelector";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#050607] text-sm text-zinc-600">
      Loading map…
    </div>
  ),
});

/** Cells below this are hidden by default so the map isn't carpeted. */
const DEFAULT_THRESHOLD = 0.05;

export default function App() {
  const region = DEFAULT_REGION;

  const [mode, setMode] = useState<Mode>("simple");
  const [weeks, setWeeks] = useState<string[] | null>(null); // null = loading
  const [week, setWeek] = useState<string | null>(null);
  const [weekData, setWeekData] = useState<{
    week: string;
    cells: Cell[];
    segments: SegmentCollection | null;
  } | null>(null);
  const [fires, setFires] = useState<FireCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const [showCells, setShowCells] = useState(true);
  const [showSegments, setShowSegments] = useState(true);
  const [showFires, setShowFires] = useState(false);
  const [cellOpacity, setCellOpacity] = useState(0.65);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);

  // Load available weeks + historical fires once per region.
  useEffect(() => {
    let cancelled = false;
    fetchWeeks(region.id)
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
    fetchFires(region.id)
      .then((fc) => {
        if (!cancelled) setFires(fc);
      })
      .catch(() => {
        /* fires are a non-critical overlay */
      });
    return () => {
      cancelled = true;
    };
  }, [region.id]);

  // Load cells + segments whenever the selected week changes.
  useEffect(() => {
    if (!week) return;
    let cancelled = false;
    Promise.all([fetchCells(region.id, week), fetchSegments(region.id, week)])
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
  }, [region.id, week]);

  const cells = weekData?.cells ?? [];
  const segments = weekData?.segments ?? null;
  const weekLoading = week !== null && weekData?.week !== week;

  const handleWeekChange = useCallback((w: string) => {
    setWeek(w);
    setSelection(null);
  }, []);

  const handleSelectSegmentFromList = useCallback((feature: SegmentFeature) => {
    setSelection({ kind: "segment", feature });
    const bounds = geometryBounds(feature.geometry);
    if (bounds) setFocus({ bounds, key: Date.now() });
  }, []);

  const pipelineEmpty = weeks !== null && weeks.length === 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#050607] text-zinc-200">
      <Header regionName={region.name} mode={mode} onModeChange={setMode} />

      <div className="relative min-h-0 flex-1">
        <MapView
          region={region}
          cells={cells}
          segments={segments}
          fires={fires}
          showCells={showCells}
          showSegments={showSegments}
          showFires={mode === "advanced" && showFires}
          cellOpacity={cellOpacity}
          threshold={threshold}
          selection={selection}
          onSelect={setSelection}
          focus={focus}
        />

        {pipelineEmpty && <EmptyState regionName={region.name} />}

        {!pipelineEmpty && (
          <aside className="absolute bottom-0 left-0 top-0 z-10 flex w-[22rem] flex-col border-r border-zinc-800/70 bg-[#0a0b0d]/85 backdrop-blur-md">
            <div className="border-b border-zinc-800/70 px-4 pb-2 pt-3">
              {weeks === null ? (
                <p className="pb-1 text-xs text-zinc-500">Loading weeks…</p>
              ) : (
                <WeekSelector
                  weeks={weeks}
                  selected={week}
                  onSelect={handleWeekChange}
                />
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

        {mode === "advanced" && !pipelineEmpty && (
          <div className="pointer-events-none absolute right-3 top-3 z-10">
            <AdvancedControls
              toggles={[
                { label: "Risk cells", checked: showCells, onChange: setShowCells },
                { label: "Corridors", checked: showSegments, onChange: setShowSegments },
                { label: "Historical fires", checked: showFires, onChange: setShowFires },
              ]}
              cellOpacity={cellOpacity}
              onCellOpacity={setCellOpacity}
              threshold={threshold}
              onThreshold={setThreshold}
            />
          </div>
        )}

        {mode === "advanced" && (
          <div className="pointer-events-none absolute bottom-8 right-3 z-10">
            <Legend />
          </div>
        )}

        {error && (
          <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md border border-red-800/60 bg-red-950/90 px-3 py-1.5 text-xs text-red-300 shadow-lg">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
