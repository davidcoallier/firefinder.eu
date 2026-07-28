"use client";

function formatWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

type WeekSelectorProps = {
  weeks: string[];
  selected: string | null;
  onSelect: (week: string) => void;
};

export default function WeekSelector({ weeks, selected, onSelect }: WeekSelectorProps) {
  if (weeks.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
      <span className="mr-1 shrink-0 text-[11px] uppercase tracking-wider text-zinc-500">
        Week of
      </span>
      {weeks.map((w, i) => {
        const active = w === selected;
        return (
          <button
            key={w}
            onClick={() => onSelect(w)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              active
                ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-300"
                : "border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
            title={w}
          >
            {formatWeek(w)}
            {i === 0 && <span className="ml-1 text-[10px] text-zinc-500">latest</span>}
          </button>
        );
      })}
    </div>
  );
}
