import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/server/auth/guards";
import { listAllOverdue } from "@/server/tasks/service";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, todayInCairo } from "@/lib/datetime";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("overdue");
  return { title: t("title") };
}

/** FR-T14 — every overdue task across everyone, in one place. Admin only. */
export default async function OverduePage() {
  const user = await requireAdminPage();
  const [tasks, t] = await Promise.all([listAllOverdue(user), getTranslations("overdue")]);
  const today = todayInCairo();

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {tasks.length === 0 ? (
        <EmptyState title={t("empty.title")} body={t("empty.body")} />
      ) : (
        <>
          <div className="hidden border border-line-strong bg-white md:block">
            <div className="flex h-[38px] items-center gap-3 border-b border-line-strong bg-ground px-4">
              <span className="label-caps flex-1">{t("columns.task")}</span>
              <span className="label-caps w-[200px]">{t("columns.assignee")}</span>
              <span className="label-caps w-[120px]">{t("columns.deadline")}</span>
              <span className="label-caps w-[110px]">{t("columns.daysOver")}</span>
            </div>
            {tasks.map((task, i) => {
              const over = Math.round(
                (today.getTime() - todayInCairo(task.deadline).getTime()) / 86400000,
              );
              return (
                <div
                  key={task.id}
                  className={`flex min-h-[52px] items-center gap-3 px-4 hover:bg-ground ${
                    i < tasks.length - 1 ? "border-b border-line-strong" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">
                    <Link href={`/tasks?employee=${task.employeeId}`} className="hover:underline">
                      {task.name}
                    </Link>
                  </span>
                  <span className="w-[200px] truncate text-[13.5px] text-ink-80">
                    {task.employee.fullName}
                  </span>
                  <span className="w-[120px]">
                    <span className="tabular inline-block rounded-xs bg-accent-soft px-[7px] py-[3px] text-[12.5px] font-semibold text-accent-text">
                      {formatDate(task.deadline)}
                    </span>
                  </span>
                  <span className="tabular w-[110px] text-[13px] font-semibold text-accent-text">
                    {t("daysOver", { days: over })}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {tasks.map((task) => {
              const over = Math.round(
                (today.getTime() - todayInCairo(task.deadline).getTime()) / 86400000,
              );
              return (
                <Link
                  key={task.id}
                  href={`/tasks?employee=${task.employeeId}`}
                  className="border border-line-strong bg-white p-[14px]"
                >
                  <span className="block text-[15px] leading-[1.3] font-semibold text-ink">
                    {task.name}
                  </span>
                  <span className="mt-1 block text-[13px] text-ink-60">{task.employee.fullName}</span>
                  <span className="mt-3 flex items-center gap-2">
                    <span className="tabular rounded-xs bg-accent-soft px-[7px] py-[3px] text-[13px] font-semibold text-accent-text">
                      {formatDate(task.deadline)}
                    </span>
                    <span className="tabular text-[13px] font-semibold text-accent-text">
                      {t("daysOver", { days: over })}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
