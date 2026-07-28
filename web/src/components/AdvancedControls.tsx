"use client";

type Toggle = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

type AdvancedControlsProps = {
  toggles: Toggle[];
  cellOpacity: number;
  onCellOpacity: (v: number) => void;
  threshold: number;
  onThreshold: (v: number) => void;
};

export default function AdvancedControls({
  toggles,
  cellOpacity,
  onCellOpacity,
  threshold,
  onThreshold,
}: AdvancedControlsProps) {
  return (
    <div className="pointer-events-auto w-60 rounded-lg border border-zinc-800 bg-[#0a0b0d]/90 p-3 shadow-lg backdrop-blur">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
        Layers
      </p>
      <div className="space-y-1.5">
        {toggles.map((t) => (
          <label
            key={t.label}
            className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300"
          >
            <input
              type="checkbox"
              checked={t.checked}
              onChange={(e) => t.onChange(e.target.checked)}
              className="h-3.5 w-3.5 accent-cyan-400"
            />
            {t.label}
          </label>
        ))}
      </div>

      <div className="mt-3 border-t border-zinc-800/70 pt-3">
        <label className="block text-xs text-zinc-400">
          Cell opacity
          <span className="float-right font-mono text-zinc-500">
            {Math.round(cellOpacity * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={cellOpacity}
            onChange={(e) => onCellOpacity(Number(e.target.value))}
            className="mt-1 w-full accent-cyan-400"
          />
        </label>
        <label className="mt-2 block text-xs text-zinc-400">
          Risk threshold
          <span className="float-right font-mono text-zinc-500">
            {threshold.toFixed(2)}
          </span>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={threshold}
            onChange={(e) => onThreshold(Number(e.target.value))}
            className="mt-1 w-full accent-cyan-400"
          />
        </label>
      </div>
    </div>
  );
}
