import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { todayInCairo } from "@/lib/datetime";
import { writeActivity } from "@/server/activity/log";
import { archiveRecord, restoreRecord } from "@/server/archive/service";
import { assertCanActOnEmployee, scopeTasks, type SessionUser } from "@/server/auth/guards";
import type { TaskInput, TaskListParams } from "@/lib/validation/task";

/**
 * Tasks — reading, creating, editing and reassigning (SPEC §9).
 * Completion and reopening live in ./complete.ts, deliberately apart, because those
 * are the invariants.
 */

/**
 * FR-T09 — "overdue" for an OPEN task means today in Cairo is past its deadline.
 * Computed live at read time, and never conflated with the frozen `wasLate` stored on
 * a completed task: one is a live warning, the other is history.
 */
export function overdueWhere(): Prisma.TaskWhereInput {
  return { status: "OPEN", deadline: { lt: todayInCairo() } };
}

/**
 * §9.1 — employee cards. Admins see every card; an employee sees only their own, and
 * the restriction is in the query so nobody else's numbers are even in the payload
 * (AC-13).
 */
export async function listEmployeeCards(user: SessionUser) {
  const where: Prisma.EmployeeWhereInput =
    user.role === "ADMIN"
      ? { isActive: true }
      : { id: user.employeeId ?? "__no_employee__" };

  const employees = await db.employee.findMany({
    where,
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, jobTitle: true, company: true, isActive: true },
  });

  const ids = employees.map((e) => e.id);
  if (ids.length === 0) return [];

  const notArchived = { isArchived: false, employeeId: { in: ids } };

  const [open, completed, overdue] = await Promise.all([
    db.task.groupBy({ by: ["employeeId"], where: { ...notArchived, status: "OPEN" }, _count: true }),
    db.task.groupBy({ by: ["employeeId"], where: { ...notArchived, status: "COMPLETED" }, _count: true }),
    db.task.groupBy({ by: ["employeeId"], where: { ...notArchived, ...overdueWhere() }, _count: true }),
  ]);

  const countOf = (rows: { employeeId: string; _count: number }[], id: string) =>
    rows.find((r) => r.employeeId === id)?._count ?? 0;

  return employees.map((e) => ({
    ...e,
    openCount: countOf(open, e.id),
    completedCount: countOf(completed, e.id),
    // Highlighted on the card when above zero (§9.1).
    overdueCount: countOf(overdue, e.id),
  }));
}

/**
 * §9.2 — a single employee's task table.
 * Default sort: open first, then deadline ascending, so the next thing due is on top.
 */
export async function listTasks(user: SessionUser, params: TaskListParams) {
  // An employee asking for another employee's tasks is refused outright (BR-09).
  if (params.employeeId) assertCanActOnEmployee(user, params.employeeId);

  const where: Prisma.TaskWhereInput = {
    isArchived: params.archived,
    ...scopeTasks(user),
    ...(params.employeeId ? { employeeId: params.employeeId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.overdue ? overdueWhere() : {}),
    ...(params.company ? { company: params.company } : {}),
    ...(params.from || params.to
      ? {
          deadline: {
            ...(params.from ? { gte: params.from } : {}),
            ...(params.to ? { lte: params.to } : {}),
          },
        }
      : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { description: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await db.task.findMany({
    where,
    // "Open tasks first, by deadline ascending" — OPEN sorts before COMPLETED
    // alphabetically, which is exactly the order §9.2 asks for.
    orderBy: [{ status: "asc" }, { deadline: "asc" }],
    skip: (params.page - 1) * params.perPage,
    take: params.perPage,
    include: {
      employee: { select: { id: true, fullName: true } },
      attachments: {
        select: { id: true, kind: true, url: true, label: true, fileId: true },
      },
    },
  });

  const total = await db.task.count({ where });
  const today = todayInCairo();

  return {
    rows: rows.map((t) => ({
      ...t,
      // Live flag for the table's deadline highlight (FR-T09).
      isOverdue: t.status === "OPEN" && t.deadline.getTime() < today.getTime(),
      fileCount: t.attachments.filter((a) => a.kind === "FILE").length,
      linkCount: t.attachments.filter((a) => a.kind === "LINK").length,
    })),
    total,
    page: params.page,
    perPage: params.perPage,
    pages: Math.max(1, Math.ceil(total / params.perPage)),
  };
}

/** A single task, scoped. A miss on a real id is a 403, never a 404 with a hint. */
export async function getTask(user: SessionUser, id: string) {
  const task = await db.task.findFirst({
    where: { id, ...scopeTasks(user) },
    include: {
      employee: { select: { id: true, fullName: true } },
      attachments: true,
    },
  });
  if (!task) throw new ForbiddenError();
  return task;
}

/** FR-T02 — admin only (§3.1). The guard runs in the action/route layer. */
export async function createTask(actorId: string, input: TaskInput) {
  return db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        employeeId: input.employeeId,
        name: input.name,
        description: input.description ?? null,
        company: input.company ?? null,
        deadline: input.deadline,
        createdBy: actorId,
      },
    });
    await writeActivity(tx, {
      actorId,
      entityType: "task",
      entityId: task.id,
      action: "create",
      meta: { name: task.name, employeeId: task.employeeId, deadline: task.deadline.toISOString() },
    });
    return task;
  });
}

/**
 * FR-T12 — admin can edit or reassign any task, and reassignment is logged.
 *
 * AC-12 lives here too: editing the deadline of an already-completed task must NOT
 * touch its stored lateness. There is deliberately no recompute call in this function.
 */
export async function updateTask(actorId: string, id: string, input: TaskInput) {
  const before = await db.task.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("That task does not exist.");

  return db.$transaction(async (tx) => {
    const task = await tx.task.update({
      where: { id },
      data: {
        employeeId: input.employeeId,
        name: input.name,
        description: input.description ?? null,
        company: input.company ?? null,
        deadline: input.deadline,
        // wasLate / daysLate / completedAt are absent on purpose (BR-07, AC-12).
      },
    });

    await writeActivity(tx, {
      actorId,
      entityType: "task",
      entityId: id,
      action: "update",
      meta: {
        before: { name: before.name, deadline: before.deadline.toISOString() },
        after: { name: task.name, deadline: task.deadline.toISOString() },
      },
    });

    if (before.employeeId !== input.employeeId) {
      await writeActivity(tx, {
        actorId,
        entityType: "task",
        entityId: id,
        action: "reassign",
        meta: { from: before.employeeId, to: input.employeeId },
      });
    }

    return task;
  });
}

/** FR-T14 — every overdue task across every employee, for admins. */
export async function listAllOverdue(user: SessionUser) {
  if (user.role !== "ADMIN") throw new ForbiddenError();

  return db.task.findMany({
    where: { isArchived: false, ...overdueWhere() },
    orderBy: [{ deadline: "asc" }],
    include: { employee: { select: { id: true, fullName: true } } },
  });
}

export function archiveTask(actorId: string, id: string) {
  return archiveRecord(actorId, "task", id, (tx) => tx.task);
}

export function restoreTask(actorId: string, id: string) {
  return restoreRecord(actorId, "task", id, (tx) => tx.task);
}
