"use client";

import { formatLength, formatPct, riskColorCss, riskTier } from "@/lib/colors";
import type { Mode } from "./Header";
import type { SegmentFeature, Selection } from "@/lib/types";
import { AdvancedDriverBars, SimpleDriverBars } from "./DriverBars";

function RiskBadge({ risk, mode }: { risk: number; mode: Mode }) {
  const tier = riskTier(risk);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tier.className}`}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: riskColorCss(risk) }}
      />
      {tier.label}
      {mode === "advanced" && (
        <span className="font-normal opacity-80">{formatPct(risk)}</span>
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
  onBack,
}: {
  selection: Selection;
  mode: Mode;
  onBack: () => void;
}) {
  const isSegment = selection.kind === "segment";
  const drivers = isSegment
    ? selection.feature.properties.drivers
    : selection.cell.drivers;

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
            <RiskBadge risk={selection.feature.properties.risk} mode={mode} />
          </div>
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
            <RiskBadge risk={selection.cell.p} mode={mode} />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            {mode === "simple"
              ? "Why ignition risk is elevated here:"
              : "Full driver attribution (signed contribution to ignition probability):"}
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
  selection: Selection | null;
  onSelectSegment: (feature: SegmentFeature) => void;
  onClearSelection: () => void;
};

export default function SidePanel({
  mode,
  segments,
  loading,
  selection,
  onSelectSegment,
  onClearSelection,
}: SidePanelProps) {
  const top = [...segments]
    .sort((a, b) => b.properties.risk - a.properties.risk)
    .slice(0, 20);

  return (
    <div className="flex h-full flex-col">
      {selection ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SelectionDetail selection={selection} mode={mode} onBack={onClearSelection} />
        </div>
      ) : (
        <>
          <div className="border-b border-slate-200 p-4 pb-3">
            <h2 className="text-base font-semibold text-slate-900">
              This week&apos;s highest-risk power line corridors
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Top {top.length} of {segments.length} monitored segments. Click one
              to inspect it on the map.
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
                        <span className="block truncate text-[15px] font-medium text-slate-800">
                          {segmentHeadline(f)}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {segmentSubtitle(f)}
                        </span>
                      </span>
                      <RiskBadge risk={f.properties.risk} mode={mode} />
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
