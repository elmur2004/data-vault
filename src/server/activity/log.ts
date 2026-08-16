import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type AnyDb } from "@/lib/db";

/**
 * Append-only activity log (SPEC §6.8).
 *
 * There is no update and no delete path — not here, not anywhere. The late-completion
 * record is a performance record about a named person, and performance records need
 * provenance.
 *
 * Always called with the transaction client of the change it records, so the entry
 * and the change commit or roll back together.
 */

export type EntityType =
  | "employee"
  | "form"
  | "sheet"
  | "document"
  | "task"
  | "file";

export type Action =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "complete"
  | "reopen"
  | "reassign"
  | "invite"
  | "activate"
  | "deactivate"
  | "reactivate"
  | "replace_file";

type Client = AnyDb;

export async function writeActivity(
  tx: Client,
  entry: {
    actorId: string;
    entityType: EntityType;
    entityId: string;
    action: Action;
    meta?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.activityLog.create({
    data: {
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      ...(entry.meta === undefined ? {} : { meta: entry.meta }),
    },
  });
}

/** Read side — used by the employee detail view and the acceptance evidence. */
export async function recentActivity(entityType: EntityType, entityId: string, take = 20) {
  return db.activityLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
