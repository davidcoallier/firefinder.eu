"use client";

import { riskGradientCss } from "@/lib/colors";

export default function Legend() {
  return (
    <div className="pointer-events-auto rounded-lg border border-zinc-800 bg-[#0a0b0d]/90 p-3 shadow-lg backdrop-blur">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        Risk (ignition probability / corridor score)
      </p>
      <div
        className="h-2.5 w-44 rounded-full"
        style={{ background: riskGradientCss() }}
      />
      <div className="mt-1 flex w-44 justify-between text-[10px] text-zinc-500">
        <span>0</span>
        <span>0.5</span>
        <span>1</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
        <span className="inline-block h-0 w-5 border-t border-[#be3c32]" />
        Historical fire perimeter
      </div>
    </div>
  );
}
