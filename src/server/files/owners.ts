import "server-only";
import { db } from "@/lib/db";
import { registerFileOwner } from "./authorize";

/**
 * File-ownership registrations, imported once by the download route.
 *
 * Each owning module registers here as its milestone lands. Anything not claimed by a
 * resolver is unreachable, because authorize.ts fails closed — an abandoned upload
 * cannot be downloaded by someone who guesses its id.
 */

/** M4 — Sheets. Any signed-in user may read (§3.1 permission matrix). */
registerFileOwner(async (_user, fileId) => {
  const sheet = await db.sheet.findFirst({ where: { fileId }, select: { id: true } });
  return sheet ? "allow" : "not-owner";
});

/** M5 — Documents. Any signed-in user may read (§3.1). */
registerFileOwner(async (_user, fileId) => {
  const doc = await db.document.findFirst({ where: { fileId }, select: { id: true } });
  return doc ? "allow" : "not-owner";
});

/**
 * M6 — task attachments follow the task's own scoping (BR-09/AC-13). An employee may
 * download a file attached to their own task and nobody else's, so a result document
 * cannot be read across the team by guessing a file id.
 */
registerFileOwner(async (user, fileId) => {
  const attachment = await db.taskAttachment.findFirst({
    where: { fileId },
    select: { task: { select: { employeeId: true } } },
  });
  if (!attachment) return "not-owner";
  if (user.role === "ADMIN") return "allow";
  return user.employeeId && attachment.task.employeeId === user.employeeId ? "allow" : "deny";
});

export {};
