"use server";

import { revalidatePath } from "next/cache";
import { employeeInput } from "@/lib/validation/employee";
import { isAppError } from "@/lib/errors";
import { requireAdmin } from "@/server/auth/guards";
import {
  createEmployee,
  reinviteEmployee,
  setEmployeeActive,
  updateEmployee,
} from "./service";

/**
 * Every mutation follows the same four steps (.agents/rules/10-stack.md):
 * zod-validated input → auth guard → transaction → ActivityLog entry.
 *
 * Creating, editing, deactivating and re-inviting are all admin-only (§3.1, BR-10).
 * `requireAdmin()` runs before anything is read or written, so an employee POSTing
 * here directly gets a 403 regardless of what the UI rendered.
 */

export type ActionResult =
  | { ok: true; message: string; values?: Record<string, string> }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

function parseEmployeeForm(formData: FormData) {
  return employeeInput.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    jobTitle: formData.get("jobTitle") || undefined,
    company: formData.get("company") ? formData.get("company") : null,
  });
}

export async function createEmployeeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = parseEmployeeForm(formData);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_FAILED", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    const { employee, mailSent } = await createEmployee(admin.id, parsed.data);
    revalidatePath("/employees");
    revalidatePath("/tasks");
    return {
      ok: true,
      message: mailSent ? "created" : "createdNoMail",
      values: { name: employee.fullName, email: employee.email },
    };
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message };
    throw e;
  }
}

export async function updateEmployeeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const parsed = parseEmployeeForm(formData);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_FAILED", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    const employee = await updateEmployee(admin.id, id, parsed.data);
    revalidatePath("/employees");
    revalidatePath("/tasks");
    return { ok: true, message: "updated", values: { name: employee.fullName } };
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message };
    throw e;
  }
}

export async function setEmployeeActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const employee = await setEmployeeActive(admin.id, id, isActive);
    revalidatePath("/employees");
    revalidatePath("/tasks");
    return {
      ok: true,
      message: isActive ? "reactivated" : "deactivated",
      values: { name: employee.fullName },
    };
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message };
    throw e;
  }
}

export async function reinviteEmployeeAction(
  id: string,
  purpose: "ACTIVATION" | "PASSWORD_RESET",
): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const { mailSent } = await reinviteEmployee(admin.id, id, purpose);
    revalidatePath("/employees");
    return mailSent
      ? { ok: true, message: "invitationSent" }
      : { ok: false, error: "invitationFailed" };
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message };
    throw e;
  }
}
