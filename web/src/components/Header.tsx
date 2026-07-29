"use client";

import Link from "next/link";
import type { Jurisdiction } from "@/lib/regions";

export type Mode = "simple" | "advanced";

type HeaderProps = {
  jurisdictions: Jurisdiction[];
  jurisdiction: Jurisdiction;
  onJurisdictionChange: (jurisdiction: Jurisdiction) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
};

export default function Header({
  jurisdictions,
  jurisdiction,
  onJurisdictionChange,
  mode,
  onModeChange,
}: HeaderProps) {
  return (
    <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-8 w-8 shrink-0" />
          <span>
            <span className="text-orange-600">fire</span>finder
          </span>
        </h1>
        <p className="hidden truncate text-sm text-slate-500 lg:block">
          Weekly wildfire ignition risk along power-grid corridors:{" "}
          {jurisdiction.label}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div
          role="group"
          aria-label="Jurisdiction"
          className="flex items-center rounded-full border border-slate-300 bg-slate-100 p-0.5 text-sm"
        >
          {jurisdictions.map((j) => (
            <button
              key={j.id}
              onClick={() => onJurisdictionChange(j)}
              aria-pressed={jurisdiction.id === j.id}
              className={`rounded-full px-3 py-1 transition-colors ${
                jurisdiction.id === j.id
                  ? "bg-white font-medium text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {j.label}
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-full border border-slate-300 bg-slate-100 p-0.5 text-sm">
          {(["simple", "advanced"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              aria-pressed={mode === m}
              className={`rounded-full px-3 py-1 capitalize transition-colors ${
                mode === m
                  ? "bg-white font-medium text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <Link
          href="/about"
          className="hidden px-1 text-sm text-slate-500 transition-colors hover:text-slate-800 sm:block"
        >
          About the data
        </Link>
      </div>
    </header>
  );
}
