import { cn } from "@/lib/utils";

/**
 * The one table pattern (design: "Pattern — table becomes cards below md").
 *
 * Forms, Sheets, Documents and Archive all render through this, so the desktop row
 * and the 375px card are defined once and cannot drift apart. NFR-03: nothing scrolls
 * horizontally on a phone.
 *
 *   ≥ md   38px header on the ground colour, 52px white rows, 16px inline padding
 *   < md   one card per record: name and company lead, the rest become label/value
 *          pairs with a 92px label column, actions become 44px targets
 */

export type Column<T> = {
  key: string;
  header: string;
  /** Fixed px width on desktop; omit for the column that should absorb slack. */
  width?: number;
  align?: "start" | "end";
  cell: (row: T) => React.ReactNode;
  /**
   * How the column behaves below `md`:
   *   title  — the card's heading (one per table)
   *   badge  — sits beside the heading
   *   pair   — a label/value row (the default)
   *   hide   — omitted from the card
   */
  mobile?: "title" | "badge" | "pair" | "hide";
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  actions,
  mobileActions,
  rowClassName,
  emptyState,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Desktop row actions, right-aligned in their own column. */
  actions?: (row: T) => React.ReactNode;
  /** Mobile action row; falls back to `actions` when not supplied. */
  mobileActions?: (row: T) => React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
  emptyState?: React.ReactNode;
}) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0];
  const badgeCols = columns.filter((c) => c.mobile === "badge");
  const pairCols = columns.filter(
    (c) => c !== titleCol && c.mobile !== "badge" && c.mobile !== "hide",
  );

  return (
    <>
      {/* ── Desktop ─────────────────────────────────────────────── */}
      <div className="hidden border border-line-strong bg-white md:block">
        <div
          role="row"
          className="flex h-[38px] items-center gap-3 border-b border-line-strong bg-ground px-4"
        >
          {columns.map((c) => (
            <span
              key={c.key}
              role="columnheader"
              className={cn("label-caps truncate", c.align === "end" && "text-end")}
              style={c.width ? { width: c.width, flex: "none" } : { flex: 1, minWidth: 0 }}
            >
              {c.header}
            </span>
          ))}
          {actions ? <span className="w-[76px] shrink-0" /> : null}
        </div>

        {rows.map((row, i) => (
          <div
            key={rowKey(row)}
            role="row"
            className={cn(
              "flex min-h-[52px] items-center gap-3 px-4 hover:bg-ground",
              i < rows.length - 1 && "border-b border-line-strong",
              rowClassName?.(row),
            )}
          >
            {columns.map((c) => (
              <span
                key={c.key}
                role="cell"
                className={cn("min-w-0 text-[13.5px] text-ink-80", c.align === "end" && "text-end")}
                style={c.width ? { width: c.width, flex: "none" } : { flex: 1, minWidth: 0 }}
              >
                {c.cell(row)}
              </span>
            ))}
            {actions ? (
              <span className="flex w-[76px] shrink-0 justify-end gap-1">{actions(row)}</span>
            ) : null}
          </div>
        ))}
      </div>

      {/* ── Mobile ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            className={cn("border border-line-strong bg-white p-[14px]", rowClassName?.(row))}
          >
            <div className="flex items-start justify-between gap-[10px]">
              <span className="min-w-0 text-[15px] leading-[1.3] font-semibold text-ink">
                {titleCol?.cell(row)}
              </span>
              {badgeCols.map((c) => (
                <span key={c.key} className="shrink-0">
                  {c.cell(row)}
                </span>
              ))}
            </div>

            {pairCols.length ? (
              <div className="mt-3 flex flex-col gap-2">
                {pairCols.map((c) => (
                  <div key={c.key} className="flex gap-[10px]">
                    <span className="w-[92px] shrink-0 pt-[2px] text-[10.5px] font-semibold tracking-[.06em] text-ink-60 uppercase">
                      {c.header}
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] text-ink-80">{c.cell(row)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {actions || mobileActions ? (
              <div className="mt-[14px] flex gap-2 border-t border-line-strong pt-3">
                {(mobileActions ?? actions)!(row)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
