"use client";

import { riskGradientCss } from "@/lib/colors";

/**
 * Map legend. The ramp is relative to the currently loaded week (colors
 * normalize to this week's distribution, not an absolute 0-1 scale).
 * Compact (simple mode) keeps plain words only; the full version (advanced
 * mode) adds overlay keys and the calibrated-probability explainer.
 */
export default function Legend({ compact = false }: { compact?: boolean }) {
  return (
    <div className="pointer-events-auto rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {compact ? "Wildfire risk" : "Wildfire risk (relative to this week)"}
      </p>
      <div
        className="h-2.5 w-44 rounded-full"
        style={{ background: riskGradientCss() }}
      />
      <div className="mt-1 flex w-44 justify-between text-[10px] text-slate-500">
        <span>Lower</span>
        <span>Higher this week</span>
      </div>
      {!compact && (
        <>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
            <span className="inline-block h-0 w-5 border-t-2 border-[rgb(120,125,135)]" />
            Lower-risk corridor (context)
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-600">
            <span className="inline-block h-0 w-5 border-t border-[#aa2d28]" />
            Historical fire perimeter
          </div>
          <p className="mt-2 w-44 text-[10px] leading-snug text-slate-500">
            Percentages are calibrated weekly wildfire occurrence probabilities. Even
            severe cells rarely exceed a few percent; tiers compare against
            this week&apos;s distribution.
          </p>
        </>
      )}
    </div>
  );
}
