import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUserPage } from "@/server/auth/guards";
import { listEmployeeCards, listTasks } from "@/server/tasks/service";
import { taskListParams } from "@/lib/validation/task";
import { PageHeader } from "@/components/layout/page-header";
import { TasksClient, type TaskRow } from "./tasks-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tasks");
  return { title: t("title") };
}

/**
 * SPEC §9. Admins see every card; an employee sees only their own, and the scoping is
 * in the query so nobody else's tasks are in the payload at all (AC-13).
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserPage();
  const raw = await searchParams;
  const params = taskListParams.parse({ ...raw, perPage: 200 });

  const [cards, t] = await Promise.all([listEmployeeCards(user), getTranslations("tasks")]);

  // An employee has exactly one card, so open it for them — there is nothing to choose
  // between. An admin opens whichever card they click.
  const openId =
    typeof raw.employee === "string"
      ? raw.employee
      : user.role === "EMPLOYEE"
        ? (cards[0]?.id ?? null)
        : null;

  const tasks = openId
    ? await listTasks(user, { ...params, employeeId: openId })
    : { rows: [], total: 0, page: 1, perPage: 200, pages: 1 };

  const totals = cards.reduce(
    (acc, c) => ({
      open: acc.open + c.openCount,
      overdue: acc.overdue + c.overdueCount,
    }),
    { open: 0, overdue: 0 },
  );

  const rows: TaskRow[] = tasks.rows.map((task) => ({
    id: task.id,
    name: task.name,
    description: task.description,
    status: task.status,
    deadline: task.deadline.toISOString(),
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    wasLate: task.wasLate,
    daysLate: task.daysLate,
    resultText: task.resultText,
    fileCount: task.fileCount,
    linkCount: task.linkCount,
    isOverdue: task.isOverdue,
    employeeId: task.employeeId,
    employeeName: task.employee.fullName,
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={
          user.role === "ADMIN"
            ? t("subtitle", {
                people: cards.length,
                open: totals.open,
                overdue: totals.overdue,
              })
            : t("subtitleEmployee", { open: totals.open })
        }
      />
      <TasksClient
        isAdmin={user.role === "ADMIN"}
        cards={cards.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          jobTitle: c.jobTitle,
          openCount: c.openCount,
          overdueCount: c.overdueCount,
          completedCount: c.completedCount,
        }))}
        openId={openId}
        tasks={rows}
      />
    </>
  );
}
