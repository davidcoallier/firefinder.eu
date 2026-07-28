"use client";

export default function EmptyState({ regionName }: { regionName: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto max-w-sm rounded-xl border border-slate-200 bg-white/95 p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-orange-600">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.3-2-.8-2.8C16.5 9.5 15 11 15 11s1.5-4-3-8Z" />
            <path d="M12 21a7 7 0 0 1-7-7c0-2 .8-3.6 1.7-4.8" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-slate-900">
          Pipeline hasn&apos;t published scores yet
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          No forecast weeks are available for {regionName} yet. Once the
          scoring pipeline finishes its first run, weekly risk maps will
          appear here automatically — check back shortly.
        </p>
      </div>
    </div>
  );
}
