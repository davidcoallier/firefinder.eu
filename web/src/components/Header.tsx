"use client";

export type Mode = "simple" | "advanced";

type HeaderProps = {
  regionName: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
};

export default function Header({ regionName, mode, onModeChange }: HeaderProps) {
  return (
    <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#0a0b0d]/95 px-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
          <span className="text-orange-500">fire</span>finder
        </h1>
        <p className="hidden text-xs text-zinc-500 sm:block">
          Weekly wildfire ignition risk along power-grid corridors — {regionName}
        </p>
      </div>
      <div className="flex items-center rounded-full border border-zinc-700 bg-zinc-900/80 p-0.5 text-xs">
        {(["simple", "advanced"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`rounded-full px-3 py-1 capitalize transition-colors ${
              mode === m
                ? "bg-cyan-400/15 text-cyan-300"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </header>
  );
}
