"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "./button";

/** Server-side paging (R-3). 50 rows a page keeps NFR-01 honest at 2,000 records. */
export function Pagination({
  page,
  pages,
  total,
  perPage,
}: {
  page: number;
  pages: number;
  total: number;
  perPage: number;
}) {
  const t = useTranslations("pagination");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (pages <= 1) return null;

  const goto = (next: number) => {
    const p = new URLSearchParams(params.toString());
    p.set("page", String(next));
    router.push(`${pathname}?${p.toString()}`);
  };

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
      <span className="tabular text-[12px] text-ink-60">{t("showing", { from, to, total })}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => goto(page - 1)}>
          {t("previous")}
        </Button>
        <span className="tabular px-1 text-[12px] text-ink-60">{t("page", { page, pages })}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => goto(page + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </div>
  );
}
