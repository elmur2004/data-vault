"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

/**
 * The filter row above every table: a 260px search field, then dropdowns, then a
 * clear-filter link and the result count.
 *
 * Every control writes to the URL, so filtering is a server round trip (R-3) and a
 * filtered view is a link somebody can send to a colleague.
 */

export type SelectFilter = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
};

export function FilterBar({
  searchPlaceholder,
  selects = [],
  total,
  filtered,
  countLabel,
}: {
  searchPlaceholder: string;
  selects?: SelectFilter[];
  total: number;
  filtered: number;
  countLabel: (shown: number, total: number) => string;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  const push = (next: URLSearchParams) => {
    next.delete("page"); // any filter change returns to page one
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  };

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  };

  // Debounce typing so the table is not re-queried on every keystroke.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const id = setTimeout(() => setParam("q", q), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters =
    Boolean(params.get("q")) || selects.some((s) => Boolean(params.get(s.name)));

  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      <label className="flex h-[34px] w-full items-center gap-2 rounded-xs border border-line-strong bg-white px-[10px] text-ink-60 sm:w-[260px]">
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden className="shrink-0">
          <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <line x1="9.4" y1="9.4" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-30"
        />
      </label>

      {selects.map((s) => {
        const value = params.get(s.name) ?? "";
        const on = Boolean(value);
        return (
          <select
            key={s.name}
            value={value}
            aria-label={s.label}
            onChange={(e) => setParam(s.name, e.target.value)}
            className={cn(
              "h-[34px] rounded-xs border px-[10px] text-[13px]",
              on
                ? "border-brand bg-brand-soft font-semibold text-violet-700"
                : "border-line-strong bg-white text-ink-80 hover:border-ink-30",
            )}
          >
            <option value="">{s.label}</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      })}

      {hasFilters ? (
        <button
          type="button"
          onClick={() => push(new URLSearchParams())}
          className="h-[34px] px-[10px] text-[12.5px] font-semibold text-violet-700 hover:text-brand"
        >
          {t("clearFilters")}
        </button>
      ) : null}

      <span className="ms-auto tabular text-[12px] text-ink-60">
        {countLabel(filtered, total)}
      </span>
    </div>
  );
}
