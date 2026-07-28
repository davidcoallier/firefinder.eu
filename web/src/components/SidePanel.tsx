"use client";

import { formatLength, formatPct, riskColorCss, riskTier } from "@/lib/colors";
import type { Mode } from "./Header";
import type { SegmentFeature, Selection } from "@/lib/types";
import { AdvancedDriverBars, SimpleDriverBars } from "./DriverBars";

function RiskBadge({ risk }: { risk: number }) {
  const tier = riskTier(risk);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tier.className}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: riskColorCss(risk) }}
      />
      {tier.label} · {formatPct(risk)}
    </span>
  );
}

function segmentTitle(f: SegmentFeature): string {
  const p = f.properties;
  const voltage = p.voltage_kv != null ? `${p.voltage_kv} kV` : "Power line";
  return `${voltage}${p.operator ? ` · ${p.operator}` : ""}`;
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
        className="mb-3 text-xs text-cyan-400 hover:text-cyan-300"
      >
        &larr; Back to ranking
      </button>

      {isSegment ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Corridor #{selection.feature.properties.rank}
              </h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                {segmentTitle(selection.feature)} ·{" "}
                {formatLength(selection.feature.properties.length_m)}
              </p>
            </div>
            <RiskBadge risk={selection.feature.properties.risk} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            {mode === "simple"
              ? "Why this corridor is at risk this week:"
              : "Full driver attribution (signed contribution to the risk score):"}
          </p>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Grid cell</h3>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                {selection.cell.h3}
              </p>
            </div>
            <RiskBadge risk={selection.cell.p} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
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
          <p className="text-sm text-zinc-500">
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
          <div className="border-b border-zinc-800/70 p-4 pb-3">
            <h2 className="text-sm font-semibold text-zinc-100">
              This week&apos;s highest-risk power line corridors
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Top {top.length} of {segments.length} monitored segments. Click one
              to inspect it on the map.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-zinc-500">Loading corridors…</p>
            ) : top.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500">
                No corridor scores for this week.
              </p>
            ) : (
              <ol>
                {top.map((f) => (
                  <li key={String(f.properties.id)}>
                    <button
                      onClick={() => onSelectSegment(f)}
                      className="flex w-full items-center gap-3 border-b border-zinc-800/50 px-4 py-2.5 text-left transition-colors hover:bg-zinc-800/40"
                    >
                      <span className="w-7 shrink-0 text-right font-mono text-xs text-zinc-500">
                        {f.properties.rank}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-zinc-200">
                          {segmentTitle(f)}
                        </span>
                        <span className="block text-[11px] text-zinc-500">
                          {formatLength(f.properties.length_m)}
                        </span>
                      </span>
                      <RiskBadge risk={f.properties.risk} />
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
