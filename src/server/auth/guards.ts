import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

/**
 * The only authorisation pattern in the app (skills/auth-roles, NFR-07).
 *
 * Every server action and route handler calls one of these. The UI hiding a control
 * is decoration; this is the enforcement. Nothing authorises off a prop, a cookie
 * read in a component, or a client-supplied id.
 */

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** The Employee row this account belongs to. Null for an admin with no card. */
  employeeId: string | null;
};

/**
 * Resolved once per request. `cache()` dedupes across the layout, the page and any
 * server actions in the same render, so scoping never costs N queries.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const employee = await db.employee.findUnique({
    where: { userId: session.user.id },
    select: { id: true, isActive: true },
  });

  // BR-13 / §5.3: deactivation must end access immediately. Sessions are revoked at
  // deactivation time, but this closes the window for any that outlive it.
  if (employee && !employee.isActive) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: (session.user as { role?: UserRole }).role ?? "EMPLOYEE",
    employeeId: employee?.id ?? null,
  };
});

/** 401 — not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** 403 — signed in, but not an admin (§3.1: everything except reading and own tasks). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ForbiddenError();
  return user;
}

/**
 * Page-level variants. A *page* should send someone somewhere useful rather than
 * render an error, so these redirect; the throwing versions above stay in server
 * actions and route handlers, where AC-13/AC-14 require a real 401/403 status.
 */
export async function requireUserPage(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireUserPage();
  if (user.role !== "ADMIN") redirect("/forms");
  return user;
}

/**
 * BR-09 / AC-13: employees read and write only their own tasks, and the restriction
 * lives in the `where` clause so another employee's row is never in the payload at all.
 *
 * DF-06 — fail closed: an account with no Employee row gets a filter that matches
 * nothing, never an unscoped `{}`.
 */
export function scopeTasks(user: SessionUser): { employeeId?: string } {
  if (user.role === "ADMIN") return {};
  return { employeeId: user.employeeId ?? "__no_employee__" };
}

/**
 * Whether this user may act on a given employee's tasks. Admins: any. Employees:
 * only their own. Used by single-record fetches, which must raise Forbidden rather
 * than reveal that the id exists.
 */
export function assertCanActOnEmployee(user: SessionUser, employeeId: string): void {
  if (user.role === "ADMIN") return;
  if (user.employeeId && user.employeeId === employeeId) return;
  throw new ForbiddenError();
}
