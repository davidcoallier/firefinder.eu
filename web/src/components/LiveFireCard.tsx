"use client";

import type { LiveFireFeature } from "@/lib/types";

function confidenceLabel(confidence: string): string {
  switch (confidence.toLowerCase()) {
    case "low":
      return "Low";
    case "nominal":
      return "Nominal";
    case "high":
      return "High";
    default:
      return confidence || "Unknown";
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

/**
 * Floating info card for a clicked live-fire detection (bottom-right of the
 * map, stacked above the legend). Dismissed via the × or by clicking empty
 * map space.
 */
export default function LiveFireCard({
  feature,
  onClose,
}: {
  feature: LiveFireFeature;
  onClose: () => void;
}) {
  const p = feature.properties;
  return (
    <div className="pointer-events-auto w-64 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          🔥 Active fire detection
        </p>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="-mr-1 -mt-1.5 rounded px-1 text-base leading-none text-slate-400 transition-colors hover:text-slate-700"
        >
          ×
        </button>
      </div>
      <div className="space-y-1 text-[13px]">
        <Row label="Detected" value={`${p.acq_date}, ${p.acq_time}`} />
        <Row label="Satellite" value={p.satellite} />
        <Row label="Fire power" value={`${p.frp.toFixed(1)} MW`} />
        <Row label="Confidence" value={confidenceLabel(p.confidence)} />
        <Row label="Overpass" value={p.daynight === "D" ? "Day" : "Night"} />
      </div>
      <p className="mt-2 border-t border-slate-200 pt-1.5 text-[11px] leading-snug text-slate-500">
        Satellite heat detection from the last 24 hours (NASA FIRMS). Position
        is approximate to ~375 m.
      </p>
    </div>
  );
}
