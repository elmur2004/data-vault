/**
 * SPEC §10.4 — every section gets a designed empty state with its primary action.
 * This app is empty on day one and half empty for a month, so these are primary
 * screens, not afterthoughts.
 *
 * The motif is the logo's geometry with the notch removed — a quiet echo, at ink-10,
 * rather than the mark itself, which must never be altered.
 */
export function EmptyState({
  title,
  body,
  action,
  note,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  /** Shown instead of the action when the reader cannot act (an employee, say). */
  note?: string;
}) {
  return (
    <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center border border-dashed border-ink-30 bg-white p-8 text-center">
      <svg viewBox="0 0 475 256" className="mb-[22px] block h-auto w-[104px]" aria-hidden>
        <g fill="rgba(35,31,32,.1)">
          <rect x="0" y="0" width="42" height="256" />
          <rect x="0" y="214" width="475" height="42" />
        </g>
      </svg>
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      <p className="mt-[10px] max-w-[420px] text-[13px] leading-[1.6] text-ink-60 text-pretty">
        {body}
      </p>
      {action ? <div className="mt-[22px]">{action}</div> : null}
      {!action && note ? <p className="mt-5 text-[12.5px] text-ink-60">{note}</p> : null}
    </div>
  );
}
