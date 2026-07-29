"use client";

type EmptyStateProps = {
  jurisdictionLabel: string;
  /**
   * Set when another jurisdiction already has published scores - the copy
   * points users back to it instead of promising an imminent pipeline run.
   */
  liveJurisdictionLabel?: string;
};

/**
 * Shown when a jurisdiction has no published weeks. Deliberately does NOT
 * cover the header, so the jurisdiction selector stays clickable and users
 * can always switch back to a live jurisdiction.
 */
export default function EmptyState({
  jurisdictionLabel,
  liveJurisdictionLabel,
}: EmptyStateProps) {
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
          No risk scores published for {jurisdictionLabel} yet
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {liveJurisdictionLabel ? (
            <>
              {`Scoring for ${jurisdictionLabel} hasn't launched yet. ${liveJurisdictionLabel} is live. Switch jurisdiction in the header above to see this week's risk map.`}
            </>
          ) : (
            <>
              Once the scoring pipeline finishes its first run for{" "}
              {jurisdictionLabel}, weekly risk maps will appear here
              automatically. Check back shortly.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
