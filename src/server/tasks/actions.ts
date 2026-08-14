"use server";

import { revalidatePath } from "next/cache";
import { resultPayload, taskInput } from "@/lib/validation/task";
import { isAppError } from "@/lib/errors";
import { requireAdmin, requireUser } from "@/server/auth/guards";
import { completeTask, reopenTask } from "./complete";
import { archiveTask, createTask, updateTask } from "./service";
import { notifyTaskAssigned } from "./notify";
import { storeUpload } from "@/server/files/service";

/**
 * Server actions for the Tasks UI.
 *
 * These are wrappers. Every rule — the gate, the server timestamp, frozen lateness,
 * admin-only reopen, employee scoping — lives in ./complete.ts and ./service.ts, so
 * the UI and the API cannot diverge on any of them.
 */

export type TaskActionResult =
  | { ok: true }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string> };

function fail(e: unknown): TaskActionResult {
  if (isAppError(e)) return { ok: false, code: e.code, message: e.message };
  throw e;
}

/**
 * R-1 — attachments are uploaded before completion, because the gate has to be able
 * to see them. This returns an id the result panel holds until the single save.
 */
export async function uploadAttachmentAction(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, message: "No file supplied." };

  try {
    const { file: stored } = await storeUpload({
      scope: "attachment",
      file,
      uploadedBy: user.id,
    });
    return {
      ok: true as const,
      fileId: stored.id,
      filename: stored.originalFilename,
      sizeBytes: stored.sizeBytes,
    };
  } catch (e) {
    if (isAppError(e)) return { ok: false as const, message: e.message };
    throw e;
  }
}

/**
 * §9.3 — one action. The result panel's save button lands here, and this both records
 * the result and completes the task, or does neither.
 */
export async function completeTaskAction(
  taskId: string,
  payload: unknown,
): Promise<TaskActionResult> {
  const user = await requireUser();
  const parsed = resultPayload.safeParse(payload ?? {});
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, code: "VALIDATION_FAILED", message: "Check the links.", fieldErrors };
  }

  try {
    await completeTask(user, taskId, parsed.data);
    revalidatePath("/tasks");
    revalidatePath("/overdue");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** BR-08 / AC-14 — admin only. reopenTask enforces it itself, not this wrapper. */
export async function reopenTaskAction(taskId: string): Promise<TaskActionResult> {
  const user = await requireUser();
  try {
    await reopenTask(user, taskId);
    revalidatePath("/tasks");
    revalidatePath("/overdue");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveTaskAction(
  _prev: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const parsed = taskInput.safeParse({
    employeeId: formData.get("employeeId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    company: formData.get("company") || null,
    deadline: formData.get("deadline"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, code: "VALIDATION_FAILED", message: "Some fields need fixing.", fieldErrors };
  }

  try {
    if (id) {
      await updateTask(admin.id, id, parsed.data);
    } else {
      const task = await createTask(admin.id, parsed.data);
      // FR-T15 — tell the assignee. A mail failure must not undo the task.
      void notifyTaskAssigned(task.id).catch(() => {});
    }
    revalidatePath("/tasks");
    revalidatePath("/overdue");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveTaskAction(id: string): Promise<TaskActionResult> {
  const admin = await requireAdmin();
  try {
    await archiveTask(admin.id, id);
    revalidatePath("/tasks");
    revalidatePath("/archive");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
