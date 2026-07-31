"use client";

import { formatProb } from "@/lib/colors";

type Toggle = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

type AdvancedControlsProps = {
  toggles: Toggle[];
  cellOpacity: number;
  onCellOpacity: (v: number) => void;
  /** Cell visibility cutoff as a position on this week's ramp, 0-1. */
  threshold: number;
  onThreshold: (v: number) => void;
  /** Raw calibrated probability the threshold resolves to, null while cells load. */
  thresholdProbability: number | null;
};

export default function AdvancedControls({
  toggles,
  cellOpacity,
  onCellOpacity,
  threshold,
  onThreshold,
  thresholdProbability,
}: AdvancedControlsProps) {
  return (
    <div className="pointer-events-auto w-60 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        Layers
      </p>
      <div className="space-y-1.5">
        {toggles.map((t) => (
          <label
            key={t.label}
            className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              checked={t.checked}
              onChange={(e) => t.onChange(e.target.checked)}
              className="h-3.5 w-3.5 accent-orange-600"
            />
            {t.label}
          </label>
        ))}
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <label className="block text-sm text-slate-600">
          Cell opacity
          <span className="float-right font-mono text-xs text-slate-500">
            {Math.round(cellOpacity * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={cellOpacity}
            onChange={(e) => onCellOpacity(Number(e.target.value))}
            className="mt-1 w-full accent-orange-600"
          />
        </label>
        <label className="mt-2 block text-sm text-slate-600">
          Cell threshold
          <span className="float-right font-mono text-xs text-slate-500">
            {threshold === 0
              ? "all cells"
              : thresholdProbability != null && thresholdProbability > 0
                ? `≥ ${formatProb(thresholdProbability)}`
                : `${Math.round(threshold * 100)}%`}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={threshold}
            onChange={(e) => onThreshold(Number(e.target.value))}
            className="mt-1 w-full accent-orange-600"
          />
          <span className="mt-0.5 block text-[10px] leading-snug text-slate-400">
            Relative to this week&apos;s distribution; the readout is the
            calibrated probability cutoff.
          </span>
        </label>
      </div>
    </div>
  );
}
