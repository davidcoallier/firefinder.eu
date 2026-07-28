"use client";

import { riskGradientCss } from "@/lib/colors";

/**
 * Map legend. Compact (simple mode) keeps plain words only; the full
 * version (advanced mode) adds the numeric scale and overlay keys.
 */
export default function Legend({ compact = false }: { compact?: boolean }) {
  return (
    <div className="pointer-events-auto rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {compact ? "Wildfire risk" : "Risk (ignition probability / corridor score)"}
      </p>
      <div
        className="h-2.5 w-44 rounded-full"
        style={{ background: riskGradientCss() }}
      />
      <div className="mt-1 flex w-44 justify-between text-[10px] text-slate-500">
        {compact ? (
          <>
            <span>Lower</span>
            <span>Higher</span>
          </>
        ) : (
          <>
            <span>0</span>
            <span>0.5</span>
            <span>1</span>
          </>
        )}
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
        </>
      )}
    </div>
  );
}
