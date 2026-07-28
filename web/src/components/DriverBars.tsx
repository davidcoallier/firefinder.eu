"use client";

import { rankDrivers } from "@/lib/drivers";
import type { Drivers } from "@/lib/types";

/**
 * Simple mode: plain-language phrases with magnitude bars.
 */
export function SimpleDriverBars({ drivers }: { drivers: Drivers }) {
  const entries = rankDrivers(drivers, 5);
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">No driver breakdown available.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {entries.map((e) => (
        <li key={e.key}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-zinc-200">{e.phrase}</span>
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">
              {e.value >= 0 ? "raises risk" : "lowers risk"}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full ${
                e.value >= 0 ? "bg-orange-500" : "bg-cyan-400"
              }`}
              style={{ width: `${Math.max(6, e.weight * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Advanced mode: full signed attribution, SHAP-style diverging bars
 * around a center line, sorted by |contribution|.
 */
export function AdvancedDriverBars({ drivers }: { drivers: Drivers }) {
  const entries = rankDrivers(drivers);
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">No driver breakdown available.</p>;
  }
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span className="text-cyan-400/80">lowers risk</span>
        <span className="text-orange-400/80">raises risk</span>
      </div>
      <ul className="space-y-1">
        {entries.map((e) => {
          const half = Math.max(2, e.weight * 50); // % of full width
          return (
            <li key={e.key} className="grid grid-cols-[minmax(0,1fr)_110px_58px] items-center gap-2">
              <span className="truncate text-xs text-zinc-300" title={e.key}>
                {e.label}
              </span>
              <div className="relative h-2.5 rounded bg-zinc-800/80">
                <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                <div
                  className={`absolute inset-y-0 rounded-sm ${
                    e.value >= 0 ? "left-1/2 bg-orange-500" : "right-1/2 bg-cyan-400"
                  }`}
                  style={{ width: `${half}%` }}
                />
              </div>
              <span
                className={`text-right font-mono text-[11px] tabular-nums ${
                  e.value >= 0 ? "text-orange-300" : "text-cyan-300"
                }`}
              >
                {e.value >= 0 ? "+" : ""}
                {e.value.toFixed(3)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
