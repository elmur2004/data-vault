import "server-only";
import type { Company } from "@prisma/client";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { writeActivity } from "@/server/activity/log";
import { issueInvitation, sendInvitation } from "./invitations";

/**
 * Employee lifecycle (SPEC §5).
 *
 * There is no delete path in this file, and there must never be one: employees are
 * deactivated so their completed task history — including the late records — survives
 * the person leaving (§5.3, BR-13).
 */

export type EmployeeFields = {
  fullName: string;
  email: string;
  jobTitle: string | null;
  company: Company | null;
};

/**
 * Creates the employee and issues the invitation in one transaction, then emails the
 * link. A failed send leaves a valid invitation the admin can re-send rather than
 * rolling back a created employee.
 */
export async function createEmployee(actorId: string, input: EmployeeFields) {
  const existing = await db.employee.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("An employee with that email already exists.");
  }

  const { employee, raw } = await db.$transaction(async (tx) => {
    const employee = await tx.employee.create({ data: input });
    const { raw } = await issueInvitation(tx, employee.id, "ACTIVATION");
    await writeActivity(tx, {
      actorId,
      entityType: "employee",
      entityId: employee.id,
      action: "create",
      meta: { fullName: employee.fullName, email: employee.email },
    });
    await writeActivity(tx, {
      actorId,
      entityType: "employee",
      entityId: employee.id,
      action: "invite",
      meta: { purpose: "ACTIVATION" },
    });
    return { employee, raw };
  });

  const mail = await sendInvitation({
    to: employee.email,
    fullName: employee.fullName,
    raw,
    purpose: "ACTIVATION",
  });

  return { employee, mailSent: mail.sent };
}

export async function updateEmployee(actorId: string, id: string, input: EmployeeFields) {
  const before = await db.employee.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("That employee does not exist.");

  if (before.email !== input.email) {
    const clash = await db.employee.findUnique({ where: { email: input.email } });
    if (clash) throw new ConflictError("Another employee already uses that email.");
  }

  return db.$transaction(async (tx) => {
    const employee = await tx.employee.update({ where: { id }, data: input });
    await writeActivity(tx, {
      actorId,
      entityType: "employee",
      entityId: id,
      action: "update",
      meta: {
        before: {
          fullName: before.fullName,
          email: before.email,
          jobTitle: before.jobTitle,
          company: before.company,
        },
        after: input,
      },
    });
    return employee;
  });
}

/**
 * §5.3 / BR-13. Deactivation hides the card and **ends access immediately** by
 * deleting the person's sessions. Task history is untouched — that is the point.
 */
export async function setEmployeeActive(actorId: string, id: string, isActive: boolean) {
  const employee = await db.employee.findUnique({ where: { id } });
  if (!employee) throw new NotFoundError("That employee does not exist.");

  return db.$transaction(async (tx) => {
    const updated = await tx.employee.update({ where: { id }, data: { isActive } });

    if (!isActive && employee.userId) {
      await tx.session.deleteMany({ where: { userId: employee.userId } });
    }

    await writeActivity(tx, {
      actorId,
      entityType: "employee",
      entityId: id,
      action: isActive ? "reactivate" : "deactivate",
      meta: { sessionsRevoked: !isActive && Boolean(employee.userId) },
    });

    return updated;
  });
}

/**
 * Re-invite. Revokes any live link and issues a new one (§5.2) — used both when an
 * invitation expires and to send a password reset.
 */
export async function reinviteEmployee(
  actorId: string,
  id: string,
  purpose: "ACTIVATION" | "PASSWORD_RESET" = "ACTIVATION",
) {
  const employee = await db.employee.findUnique({ where: { id } });
  if (!employee) throw new NotFoundError("That employee does not exist.");

  const raw = await db.$transaction(async (tx) => {
    const { raw } = await issueInvitation(tx, id, purpose);
    await writeActivity(tx, {
      actorId,
      entityType: "employee",
      entityId: id,
      action: "invite",
      meta: { purpose, resent: true },
    });
    return raw;
  });

  const mail = await sendInvitation({
    to: employee.email,
    fullName: employee.fullName,
    raw,
    purpose,
  });
  return { mailSent: mail.sent };
}

/** Default view hides deactivated employees (§5.3). */
export async function listEmployees(opts: { includeInactive?: boolean } = {}) {
  return db.employee.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      email: true,
      jobTitle: true,
      company: true,
      isActive: true,
      userId: true,
      createdAt: true,
      invitations: {
        where: { usedAt: null, revokedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { expiresAt: true, purpose: true },
      },
    },
  });
}
