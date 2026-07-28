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
      <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        Week of
      </span>
      {weeks.map((w, i) => {
        const active = w === selected;
        return (
          <button
            key={w}
            onClick={() => onSelect(w)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-sm transition-colors ${
              active
                ? "border-orange-400 bg-orange-100 font-medium text-orange-900"
                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
            }`}
            title={w}
          >
            {formatWeek(w)}
            {i === 0 && (
              <span
                className={`ml-1 text-[10px] ${
                  active ? "text-orange-700/80" : "text-slate-400"
                }`}
              >
                latest
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
