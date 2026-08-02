"use client";

import { formatFireDistance } from "@/lib/activeFires";
import { formatLength, formatProb, riskColorCss } from "@/lib/colors";
import { spreadAgreement, type WeekScale } from "@/lib/tiers";
import type { Mode } from "./Header";
import type { SegmentFeature, Selection } from "@/lib/types";
import { AdvancedDriverBars, SimpleDriverBars } from "./DriverBars";

/** How many flagged corridors the pinned status section lists before "+N more". */
const MAX_FLAGGED_ROWS = 10;

/** Small flame marker for corridors flagged as near an active fire. */
function FlameMark() {
  return (
    <span aria-label="Near an active fire" title="Near an active fire" className="text-[11px]">
      🔥
    </span>
  );
}

/**
 * Status banner shown above the drivers when reality has overtaken the
 * forecast: an active detection in this cell, or within reach of this
 * corridor. The weekly scores themselves are untouched.
 */
function ActiveFireBanner({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border border-red-300 bg-gradient-to-r from-red-50 to-amber-50 px-3 py-2">
      <span className="text-sm leading-5">🔥</span>
      <p className="text-[13px] font-medium leading-snug text-red-900">{text}</p>
    </div>
  );
}

/** Tier badge relative to this week's distribution; advanced mode adds the calibrated probability. */
function RiskBadge({
  value,
  scale,
  mode,
}: {
  value: number;
  scale: WeekScale;
  mode: Mode;
}) {
  const tier = scale.tier(value);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tier.className}`}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: riskColorCss(scale.normalize(value)) }}
      />
      {tier.label}
      {mode === "advanced" && (
        <span className="font-normal opacity-80">{formatProb(value)}</span>
      )}
    </span>
  );
}

/** Human-first headline: the nearest town, falling back to the rank. */
function segmentHeadline(f: SegmentFeature): string {
  const { locality, rank } = f.properties;
  return locality ? `Near ${locality}` : `Corridor #${rank}`;
}

/** Technical secondary line: voltage / operator / length. */
function segmentSubtitle(f: SegmentFeature): string {
  const p = f.properties;
  const parts = [
    p.voltage_kv != null ? `${p.voltage_kv} kV` : "Power line",
    p.operator,
    formatLength(p.length_m),
  ].filter((s): s is string => s != null && s !== "");
  return parts.join(" · ");
}

function SelectionDetail({
  selection,
  mode,
  corridorScale,
  cellScale,
  fireDistanceM,
  cellOnFire,
  onBack,
}: {
  selection: Selection;
  mode: Mode;
  corridorScale: WeekScale;
  cellScale: WeekScale;
  /** Distance to the nearest live detection, when this corridor is flagged. */
  fireDistanceM: number | null;
  /** True when the selected cell contains a live detection. */
  cellOnFire: boolean;
  onBack: () => void;
}) {
  const isSegment = selection.kind === "segment";
  const drivers = isSegment
    ? selection.feature.properties.drivers
    : selection.cell.drivers;
  const spread = !isSegment && selection.cell.s != null ? selection.cell.s : null;
  const agreement = spread != null ? spreadAgreement(spread) : null;

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-3 text-sm font-medium text-orange-700 hover:text-orange-800"
      >
        &larr; Back to ranking
      </button>

      {isSegment ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {selection.feature.properties.locality
                  ? `Corridor near ${selection.feature.properties.locality}`
                  : `Corridor #${selection.feature.properties.rank}`}
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">
                {segmentSubtitle(selection.feature)}
              </p>
            </div>
            <RiskBadge
              value={selection.feature.properties.risk}
              scale={corridorScale}
              mode={mode}
            />
          </div>
          {fireDistanceM != null && (
            <ActiveFireBanner
              text={`Active fire within ${formatFireDistance(fireDistanceM)} of this corridor (last 24 h). The weekly forecast below was computed before this detection.`}
            />
          )}
          {mode === "advanced" && (
            <p className="mt-2 text-sm text-slate-600">
              {formatProb(selection.feature.properties.risk)} corridor risk on
              the calibrated weekly probability scale (a blend of its worst
              and average member cells).
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            {mode === "simple"
              ? "Why this corridor is at risk this week:"
              : "Full driver attribution (signed contribution to the risk score):"}
          </p>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Grid cell</h3>
              <p className="mt-0.5 font-mono text-xs text-slate-500">
                {selection.cell.h3}
              </p>
            </div>
            <RiskBadge value={selection.cell.p} scale={cellScale} mode={mode} />
          </div>
          {cellOnFire && (
            <ActiveFireBanner text="Active fire detected in this cell (last 24 h). The weekly forecast below was computed before this detection." />
          )}
          {mode === "advanced" && (
            <p className="mt-2 text-sm text-slate-600">
              {formatProb(selection.cell.p)} weekly wildfire probability.
            </p>
          )}
          {mode === "advanced" && spread != null && agreement && (
            <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium text-slate-700">
                Model agreement: {agreement.label.toLowerCase()}
                <span className="float-right font-mono text-[11px] text-slate-500">
                  spread {spread.toFixed(3)}
                </span>
              </p>
              <p className="mt-0.5 text-xs leading-snug text-slate-500">
                {agreement.sentence}
              </p>
            </div>
          )}
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            {mode === "simple"
              ? "Why wildfire risk is elevated here:"
              : "Full driver attribution (signed contribution to wildfire probability):"}
          </p>
        </>
      )}

      <div className="mt-3">
        {drivers && Object.keys(drivers).length > 0 ? (
          mode === "simple" ? (
            <SimpleDriverBars drivers={drivers} />
          ) : (
            <AdvancedDriverBars drivers={drivers} />
          )
        ) : (
          <p className="text-sm text-slate-500">
            No driver breakdown available for this{" "}
            {isSegment ? "corridor" : "cell"}.
          </p>
        )}
      </div>
    </div>
  );
}

type SidePanelProps = {
  mode: Mode;
  segments: SegmentFeature[];
  loading: boolean;
  corridorScale: WeekScale;
  cellScale: WeekScale;
  /** Segment id to distance (m) of the nearest live detection within 1.5 km. */
  fireDistances: Map<string | number, number>;
  /** H3 indexes with a live detection in the last 24h. */
  activeCells: Set<string>;
  selection: Selection | null;
  onSelectSegment: (feature: SegmentFeature) => void;
  onClearSelection: () => void;
};

export default function SidePanel({
  mode,
  segments,
  loading,
  corridorScale,
  cellScale,
  fireDistances,
  activeCells,
  selection,
  onSelectSegment,
  onClearSelection,
}: SidePanelProps) {
  // The pipeline publishes an authoritative per-week rank; trust it over a
  // local re-sort so the list matches the scoring run's own ordering.
  const top = [...segments]
    .sort((a, b) => a.properties.rank - b.properties.rank)
    .slice(0, 20);

  // Corridors near a live detection, nearest first. Pinned above the ranked
  // list: a status about right now, not a change to the weekly ranking.
  const flagged = segments
    .filter((f) => fireDistances.has(f.properties.id))
    .sort(
      (a, b) =>
        (fireDistances.get(a.properties.id) ?? Infinity) -
        (fireDistances.get(b.properties.id) ?? Infinity)
    );
  const flaggedShown = flagged.slice(0, MAX_FLAGGED_ROWS);
  const flaggedOverflow = flagged.length - flaggedShown.length;

  const selectedFireDistance =
    selection?.kind === "segment"
      ? (fireDistances.get(selection.feature.properties.id) ?? null)
      : null;
  const selectedCellOnFire =
    selection?.kind === "cell" && activeCells.has(selection.cell.h3);

  return (
    <div className="flex h-full flex-col">
      {selection ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SelectionDetail
            selection={selection}
            mode={mode}
            corridorScale={corridorScale}
            cellScale={cellScale}
            fireDistanceM={selectedFireDistance}
            cellOnFire={selectedCellOnFire}
            onBack={onClearSelection}
          />
        </div>
      ) : (
        <>
          {!loading && flaggedShown.length > 0 && (
            <div className="shrink-0 border-b-2 border-red-200 bg-red-50/50">
              <div className="px-4 pb-1.5 pt-3">
                <h2 className="text-base font-semibold text-red-900">
                  🔥 Near active fires right now
                </h2>
                <p className="mt-0.5 text-[13px] leading-snug text-red-800/80">
                  Corridors within 1.5 km of a satellite fire detection from
                  the last 24 hours.
                </p>
              </div>
              <ol className="max-h-64 overflow-y-auto">
                {flaggedShown.map((f) => {
                  const distance = fireDistances.get(f.properties.id);
                  return (
                    <li key={String(f.properties.id)}>
                      <button
                        onClick={() => onSelectSegment(f)}
                        className="flex w-full items-center gap-3 border-t border-red-100 px-4 py-3 text-left transition-colors hover:bg-red-100/60"
                      >
                        <span className="w-7 shrink-0 text-right">
                          <FlameMark />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-slate-800">
                            {segmentHeadline(f)}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {segmentSubtitle(f)}
                          </span>
                          {distance != null && (
                            <span className="block text-xs font-medium text-red-800">
                              fire detected {formatFireDistance(distance)} away
                            </span>
                          )}
                        </span>
                        <RiskBadge
                          value={f.properties.risk}
                          scale={corridorScale}
                          mode={mode}
                        />
                      </button>
                    </li>
                  );
                })}
              </ol>
              {flaggedOverflow > 0 && (
                <p className="border-t border-red-100 px-4 py-1.5 text-xs text-red-800/80">
                  +{flaggedOverflow} more corridor{flaggedOverflow === 1 ? "" : "s"} near
                  active fires
                </p>
              )}
            </div>
          )}
          <div className="border-b border-slate-200 p-4 pb-3">
            <h2 className="text-base font-semibold text-slate-900">
              This week&apos;s highest-risk power line corridors
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {loading
                ? "Ranking this week's corridors…"
                : `The ${top.length} highest-risk corridors this week. Click one to inspect it on the map.`}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading corridors…</p>
            ) : top.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                No corridor scores for this week.
              </p>
            ) : (
              <ol>
                {top.map((f) => (
                  <li key={String(f.properties.id)}>
                    <button
                      onClick={() => onSelectSegment(f)}
                      className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-orange-50/60"
                    >
                      <span className="w-7 shrink-0 text-right font-mono text-xs text-slate-400">
                        {f.properties.rank}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-[15px] font-medium text-slate-800">
                          <span className="truncate">{segmentHeadline(f)}</span>
                          {fireDistances.has(f.properties.id) && <FlameMark />}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {segmentSubtitle(f)}
                        </span>
                      </span>
                      <RiskBadge
                        value={f.properties.risk}
                        scale={corridorScale}
                        mode={mode}
                      />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}
