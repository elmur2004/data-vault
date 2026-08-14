import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUserPage } from "@/server/auth/guards";
import { listSheets } from "@/server/sheets/service";
import { sheetListParams } from "@/lib/validation/sheet";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { SheetsClient } from "./sheets-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sheets");
  return { title: t("title") };
}

/** FR-S01..S09. */
export default async function SheetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserPage();
  const params = sheetListParams.parse(await searchParams);

  const [page, total, t] = await Promise.all([
    listSheets(params),
    db.sheet.count({ where: { isArchived: false } }),
    getTranslations("sheets"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <SheetsClient
        isAdmin={user.role === "ADMIN"}
        total={total}
        page={{
          ...page,
          rows: page.rows.map((s) => ({
            id: s.id,
            name: s.name,
            storageMode: s.storageMode,
            url: s.url,
            fileId: s.fileId,
            fileName: s.file?.originalFilename ?? null,
            dateCreated: s.dateCreated.toISOString(),
            company: s.company,
            type: s.type,
            lastRecordCount: s.lastRecordCount,
            lastRecordCountAsOf: s.lastRecordCountAsOf?.toISOString() ?? null,
            notes: s.notes,
          })),
        }}
      />
    </>
  );
}
