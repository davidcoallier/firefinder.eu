"use client";

import { rankDrivers } from "@/lib/drivers";
import type { Drivers } from "@/lib/types";

/**
 * Simple mode: just the plain-language phrase plus a magnitude bar —
 * no feature keys, no numbers (those live in advanced mode).
 */
export function SimpleDriverBars({ drivers }: { drivers: Drivers }) {
  const entries = rankDrivers(drivers, 5);
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No driver breakdown available.</p>;
  }
  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.key}>
          <span className="text-sm text-slate-800">{e.phrase}</span>
          <div className="mt-1 h-2 rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${
                e.value >= 0 ? "bg-orange-500" : "bg-blue-500"
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
    return <p className="text-sm text-slate-500">No driver breakdown available.</p>;
  }
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] uppercase tracking-wider">
        <span className="text-blue-700">lowers risk</span>
        <span className="text-orange-700">raises risk</span>
      </div>
      <ul className="space-y-1">
        {entries.map((e) => {
          const half = Math.max(2, e.weight * 50); // % of full width
          return (
            <li key={e.key} className="grid grid-cols-[minmax(0,1fr)_110px_58px] items-center gap-2">
              <span className="truncate text-xs text-slate-600" title={e.key}>
                {e.label}
              </span>
              <div className="relative h-2.5 rounded bg-slate-200">
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-400" />
                <div
                  className={`absolute inset-y-0 rounded-sm ${
                    e.value >= 0 ? "left-1/2 bg-orange-500" : "right-1/2 bg-blue-500"
                  }`}
                  style={{ width: `${half}%` }}
                />
              </div>
              <span
                className={`text-right font-mono text-[11px] tabular-nums ${
                  e.value >= 0 ? "text-orange-700" : "text-blue-700"
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
