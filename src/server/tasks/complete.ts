import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ForbiddenError, UnprocessableError } from "@/lib/errors";
import { writeActivity } from "@/server/activity/log";
import { scopeTasks, type SessionUser } from "@/server/auth/guards";
import { computeLateness } from "./lateness";

/**
 * The ONLY code path that completes a task (§9.3, §9.4, BR-05..BR-07).
 *
 * Nothing else in this codebase may set `status = COMPLETED`. Every rule the product
 * exists for lives in this one transaction:
 *
 *   • the gate is re-checked here, inside the transaction, whatever the client claimed
 *   • `completedAt` comes from server time, never the browser
 *   • lateness is computed once and STORED, never derived on read
 *
 * AC-08 sends a completion request straight at the API for a task with no result and
 * requires a 422 with the task still open. That is this function's job, not the UI's.
 */

export type ResultPayload = {
  /** Free text. One of the three things that satisfy the gate. */
  resultText?: string | null;
  /** StoredFile ids already uploaded through the file service. */
  fileIds?: string[];
  /** Links pasted into the result panel. */
  links?: { url: string; label?: string | null }[];
};

const hasPayload = (p?: ResultPayload) =>
  Boolean(p && (p.resultText?.trim() || p.fileIds?.length || p.links?.length));

/**
 * Attaches a result **and** completes the task in a single transaction — "one action,
 * not two" (§9.3). If the gate is not satisfied, nothing at all is committed.
 *
 * R-1: the files themselves are uploaded before this call, because attachments must
 * exist before the gate can see them. Only their ids arrive here, so a 422 leaves no
 * half-finished task behind.
 */
export async function completeTask(
  user: SessionUser,
  taskId: string,
  payload?: ResultPayload,
) {
  return db.$transaction(async (tx) => {
    // BR-09/AC-13: scoping is in the query. An employee asking about someone else's
    // task gets a miss, and a miss is a 403 — never a hint that the id exists.
    const task = await tx.task.findFirst({
      where: { id: taskId, isArchived: false, ...scopeTasks(user) },
      include: { attachments: { select: { id: true } } },
    });
    if (!task) throw new ForbiddenError();

    if (task.status !== "OPEN") {
      throw new UnprocessableError("TASK_NOT_OPEN", "That task is already completed.");
    }

    // Apply anything the result panel sent, in the same transaction.
    let resultText = task.resultText;
    if (payload?.resultText !== undefined) {
      resultText = payload.resultText?.trim() ? payload.resultText.trim() : null;
    }

    const created: Prisma.TaskAttachmentCreateManyInput[] = [];
    for (const fileId of payload?.fileIds ?? []) {
      created.push({ taskId: task.id, kind: "FILE", fileId, addedBy: user.id });
    }
    for (const link of payload?.links ?? []) {
      created.push({
        taskId: task.id,
        kind: "LINK",
        url: link.url,
        label: link.label ?? null,
        addedBy: user.id,
      });
    }
    if (created.length) await tx.taskAttachment.createMany({ data: created });

    const attachmentCount = task.attachments.length + created.length;

    /**
     * BR-05 — a result is satisfied by ANY ONE of: result text, at least one file, or
     * at least one link. Never text *and* an attachment: forcing someone to type
     * "see attached" teaches everyone the gate is theatre (§9.3).
     */
    const hasResult = Boolean(resultText?.trim()) || attachmentCount > 0;
    if (!hasResult) {
      throw new UnprocessableError(
        "RESULT_REQUIRED",
        "Add a result before completing this task — a note, a file, or a link.",
      );
    }

    // BR-06 — server time. Not the browser's, and not user editable.
    const completedAt = new Date();
    // BR-07 — computed once, here, and stored.
    const { wasLate, daysLate } = computeLateness(task.deadline, completedAt);

    const updated = await tx.task.update({
      where: { id: task.id },
      data: { status: "COMPLETED", completedAt, wasLate, daysLate, resultText },
    });

    await writeActivity(tx, {
      actorId: user.id,
      entityType: "task",
      entityId: task.id,
      action: "complete",
      meta: {
        wasLate,
        daysLate,
        completedAt: completedAt.toISOString(),
        deadline: task.deadline.toISOString(),
        resultKinds: {
          text: Boolean(resultText?.trim()),
          files: (payload?.fileIds ?? []).length,
          links: (payload?.links ?? []).length,
        },
      },
    });

    return updated;
  });
}

/**
 * Adds to a task's result without completing it — the "save for later" half of the
 * result panel. Deliberately separate from completion so the gate stays in one place.
 */
export async function saveResult(user: SessionUser, taskId: string, payload: ResultPayload) {
  if (!hasPayload(payload)) {
    throw new UnprocessableError("VALIDATION_FAILED", "Nothing to save.");
  }

  return db.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: taskId, isArchived: false, ...scopeTasks(user) },
    });
    if (!task) throw new ForbiddenError();
    if (task.status !== "OPEN") {
      throw new UnprocessableError("TASK_NOT_OPEN", "That task is already completed.");
    }

    const data: Prisma.TaskUpdateInput = {};
    if (payload.resultText !== undefined) {
      data.resultText = payload.resultText?.trim() ? payload.resultText.trim() : null;
    }

    const created: Prisma.TaskAttachmentCreateManyInput[] = [];
    for (const fileId of payload.fileIds ?? []) {
      created.push({ taskId: task.id, kind: "FILE", fileId, addedBy: user.id });
    }
    for (const link of payload.links ?? []) {
      created.push({
        taskId: task.id,
        kind: "LINK",
        url: link.url,
        label: link.label ?? null,
        addedBy: user.id,
      });
    }
    if (created.length) await tx.taskAttachment.createMany({ data: created });

    const updated = await tx.task.update({ where: { id: task.id }, data });

    await writeActivity(tx, {
      actorId: user.id,
      entityType: "task",
      entityId: task.id,
      action: "update",
      meta: { result: true, files: created.filter((c) => c.kind === "FILE").length },
    });

    return updated;
  });
}

/**
 * BR-08 / §9.5 / AC-14 — reopening is admin-only, including for the task's own
 * employee, who gets a 403.
 *
 * Clears the completion fields and records the previous values, because the lateness
 * being erased was a performance record and erasing it needs provenance.
 */
export async function reopenTask(user: SessionUser, taskId: string) {
  if (user.role !== "ADMIN") throw new ForbiddenError();

  return db.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id: taskId, isArchived: false } });
    if (!task) throw new ForbiddenError();

    if (task.status !== "COMPLETED") {
      throw new UnprocessableError("TASK_NOT_OPEN", "That task is not completed.");
    }

    const updated = await tx.task.update({
      where: { id: task.id },
      // The result text and attachments stay — only the completion is undone (§9.5).
      data: { status: "OPEN", completedAt: null, wasLate: null, daysLate: null },
    });

    await writeActivity(tx, {
      actorId: user.id,
      entityType: "task",
      entityId: task.id,
      action: "reopen",
      meta: {
        previous: {
          completedAt: task.completedAt?.toISOString() ?? null,
          wasLate: task.wasLate,
          daysLate: task.daysLate,
        },
      },
    });

    return updated;
  });
}
