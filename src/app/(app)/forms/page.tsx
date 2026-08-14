import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUserPage } from "@/server/auth/guards";
import { listForms } from "@/server/forms/service";
import { formListParams } from "@/lib/validation/form";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { FormsClient } from "./forms-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("forms");
  return { title: t("title") };
}

/** FR-F01..F08. Everyone reads; only admins write (§3.1, BR-10). */
export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserPage();
  const raw = await searchParams;
  const params = formListParams.parse(raw);

  const [page, total, t] = await Promise.all([
    listForms(params),
    db.form.count({ where: { isArchived: false } }),
    getTranslations("forms"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <FormsClient
        isAdmin={user.role === "ADMIN"}
        total={total}
        page={{
          ...page,
          rows: page.rows.map((f) => ({
            id: f.id,
            name: f.name,
            url: f.url,
            company: f.company,
            notes: f.notes,
            createdAt: f.createdAt.toISOString(),
          })),
        }}
      />
    </>
  );
}
