"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/datetime";
import { restoreFormAction } from "@/server/forms/actions";
import { restoreSheetAction } from "@/server/sheets/actions";
import { restoreDocumentAction } from "@/server/documents/actions";
import type { ArchivedRecord } from "@/server/archive/list";

const SECTIONS = ["form", "sheet", "document", "task"] as const;

export function ArchiveClient({ rows, total }: { rows: ArchivedRecord[]; total: number }) {
  const t = useTranslations("archive");
  const tc = useTranslations("common");
  const tSection = useTranslations("archive.sections");
  const router = useRouter();
  const [pending, start] = useTransition();

  const restore = (row: ArchivedRecord) =>
    start(async () => {
      const res =
        row.section === "form"
          ? await restoreFormAction(row.id)
          : row.section === "sheet"
            ? await restoreSheetAction(row.id)
            : row.section === "document"
              ? await restoreDocumentAction(row.id)
              : { ok: false as const, message: tc("somethingWentWrong") };

      if (res.ok) toast.success(tc("restored", { name: row.name }));
      else toast.error(("message" in res && res.message) || tc("somethingWentWrong"));
      router.refresh();
    });

  const columns: Column<ArchivedRecord>[] = [
    {
      key: "name",
      header: t("columns.name"),
      width: 300,
      mobile: "title",
      cell: (r) => <span className="text-[14px] font-semibold text-ink">{r.name}</span>,
    },
    {
      key: "section",
      header: t("columns.section"),
      width: 120,
      mobile: "badge",
      cell: (r) => <Badge variant="quiet">{tSection(r.section)}</Badge>,
    },
    {
      key: "archivedAt",
      header: t("columns.archivedOn"),
      width: 120,
      cell: (r) => <span className="tabular">{formatDate(r.archivedAt)}</span>,
    },
    { key: "detail", header: " ", cell: (r) => <span>{r.detail ?? "—"}</span>, mobile: "hide" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        searchPlaceholder={t("searchPlaceholder")}
        total={total}
        filtered={rows.length}
        countLabel={(shown, all) => tc("countOf", { shown, total: all, unit: t("unit") })}
        selects={[
          {
            name: "section",
            label: t("allSections"),
            options: SECTIONS.map((s) => ({ value: s, label: tSection(s) })),
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.section}-${r.id}`}
        emptyState={<EmptyState title={t("empty.title")} body={t("empty.body")} />}
        actions={(r) =>
          r.section === "task" ? null : (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => restore(r)}>
              {t("restore")}
            </Button>
          )
        }
        mobileActions={(r) =>
          r.section === "task" ? null : (
            <Button
              variant="secondary"
              size="touch"
              className="flex-1"
              disabled={pending}
              onClick={() => restore(r)}
            >
              {t("restore")}
            </Button>
          )
        }
      />
    </div>
  );
}
