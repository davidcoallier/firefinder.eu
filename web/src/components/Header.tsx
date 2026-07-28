"use client";

export type Mode = "simple" | "advanced";

type HeaderProps = {
  regionName: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
};

export default function Header({ regionName, mode, onModeChange }: HeaderProps) {
  return (
    <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          <span className="text-orange-600">fire</span>finder
        </h1>
        <p className="hidden text-sm text-slate-500 sm:block">
          Weekly wildfire ignition risk along power-grid corridors — {regionName}
        </p>
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
    </header>
  );
}
