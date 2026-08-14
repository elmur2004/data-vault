import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/server/auth/guards";
import { listArchived } from "@/server/archive/list";
import { PageHeader } from "@/components/layout/page-header";
import { ArchiveClient } from "./archive-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("archive");
  return { title: t("title") };
}

/** BR-11 / AC-15 — nothing is hard deleted, so everything deleted is here. Admin only. */
export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const raw = await searchParams;
  const q = typeof raw.q === "string" ? raw.q : undefined;
  const section = typeof raw.section === "string" ? raw.section : undefined;

  const [all, t] = await Promise.all([listArchived(q), getTranslations("archive")]);
  const rows = section ? all.filter((r) => r.section === section) : all;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ArchiveClient rows={rows} total={all.length} />
    </>
  );
}
