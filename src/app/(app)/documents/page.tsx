import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUserPage } from "@/server/auth/guards";
import { listDocuments } from "@/server/documents/service";
import { documentListParams } from "@/lib/validation/document";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { DocumentsClient } from "./documents-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents");
  return { title: t("title") };
}

/** FR-D01..D09. */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserPage();
  const params = documentListParams.parse(await searchParams);

  const [page, total, t] = await Promise.all([
    listDocuments(params),
    db.document.count({ where: { isArchived: false } }),
    getTranslations("documents"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <DocumentsClient
        isAdmin={user.role === "ADMIN"}
        total={total}
        page={{
          ...page,
          rows: page.rows.map((d) => ({
            id: d.id,
            name: d.name,
            description: d.description,
            company: d.company,
            type: d.type,
            fileId: d.fileId,
            fileName: d.file.originalFilename,
            mimeType: d.file.mimeType,
            createdAt: d.createdAt.toISOString(),
          })),
        }}
      />
    </>
  );
}
