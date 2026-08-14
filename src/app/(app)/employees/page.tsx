import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/server/auth/guards";
import { listEmployees } from "@/server/employees/service";
import { PageHeader } from "@/components/layout/page-header";
import { EmployeesClient } from "./employees-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("employees");
  return { title: t("title") };
}

/**
 * Admin only (§3.1). The guard runs before any data is read, so an employee hitting
 * /employees directly gets a 403 rather than an empty page.
 */
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ inactive?: string }>;
}) {
  await requireAdminPage();
  const { inactive } = await searchParams;
  const includeInactive = inactive === "1";

  const t = await getTranslations("employees");
  const employees = await listEmployees({ includeInactive });

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <EmployeesClient
        employees={employees.map((e) => ({
          id: e.id,
          fullName: e.fullName,
          email: e.email,
          jobTitle: e.jobTitle,
          company: e.company,
          isActive: e.isActive,
          hasAccount: Boolean(e.userId),
          pendingInvitationUntil: e.invitations[0]?.expiresAt?.toISOString() ?? null,
        }))}
        includeInactive={includeInactive}
      />
    </>
  );
}
