"use client";

import type { BasemapMode } from "@/lib/basemap";

const OPTIONS: { value: BasemapMode; label: string }[] = [
  { value: "satellite", label: "Satellite" },
  { value: "plain", label: "Plain" },
];

/** Small map-corner segmented control switching Satellite / Plain basemaps. */
export default function BasemapToggle({
  mode,
  onChange,
}: {
  mode: BasemapMode;
  onChange: (mode: BasemapMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Basemap"
      className="flex items-center rounded-full border border-slate-300 bg-white/95 p-0.5 text-xs shadow-md backdrop-blur-sm"
    >
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          className={`rounded-full px-2.5 py-1 transition-colors ${
            mode === value
              ? "bg-slate-800 font-medium text-white"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
