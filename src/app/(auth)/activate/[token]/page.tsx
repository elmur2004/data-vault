import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { lookupInvitation } from "@/server/auth/activate";
import { db } from "@/lib/db";
import { ActivateForm } from "./activate-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("activateTitle") };
}

/**
 * §5.2 — single-use, seven-day activation link. A dead link gets a screen that says
 * what happened and what to do about it, not a blank failure.
 */
export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("auth");
  const found = await lookupInvitation(token);

  if (!found.ok) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-ink">{t("linkDeadTitle")}</h1>
        <p className="text-sm text-ink-60">{t(`linkDead.${found.reason}`)}</p>
        <p className="text-sm text-ink-60">{t("linkDeadHint")}</p>
        <Link href="/login" className="text-sm font-semibold text-violet-700 underline">
          {t("backToSignIn")}
        </Link>
      </div>
    );
  }

  const employee = await db.employee.findUnique({
    where: { id: found.invitation.employeeId },
    select: { fullName: true, email: true },
  });

  return (
    <ActivateForm
      token={token}
      fullName={employee?.fullName ?? ""}
      email={employee?.email ?? ""}
      purpose={found.invitation.purpose}
    />
  );
}
