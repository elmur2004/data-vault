import "server-only";
import { db, type TxClient } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { writeActivity, type EntityType } from "@/server/activity/log";

/**
 * BR-11 / §10.2 / AC-15 — nothing is hard deleted, anywhere.
 *
 * "Delete" in the interface means archive. Archived records disappear from default
 * views and from counts, and an admin can restore them. There is no `delete()` call
 * for any user-facing entity in this codebase, and there must never be one.
 */

/**
 * The one filter every listing query spreads, so none of them can forget it.
 *   where: { ...NOT_ARCHIVED, ...otherFilters }
 */
export const NOT_ARCHIVED = { isArchived: false } as const;

/** Entities that archive. Employees deactivate instead (§5.3, BR-13). */
export type ArchivableType = Extract<EntityType, "form" | "sheet" | "document" | "task">;

/**
 * The minimum surface archival needs. Each module passes its own delegate, so this
 * service never has to know which models exist — it grows with the app for free.
 */
type ArchivableDelegate = {
  findUnique: (args: { where: { id: string } }) => Promise<{ id: string } | null>;
  update: (args: { where: { id: string }; data: { isArchived: boolean } }) => Promise<unknown>;
};

type DelegateSelector = (tx: TxClient) => ArchivableDelegate;

async function setArchived(
  actorId: string,
  type: ArchivableType,
  id: string,
  select: DelegateSelector,
  isArchived: boolean,
) {
  return db.$transaction(async (tx) => {
    const delegate = select(tx);

    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError();

    await delegate.update({ where: { id }, data: { isArchived } });

    // Same transaction as the change it records (§6.8).
    await writeActivity(tx, {
      actorId,
      entityType: type,
      entityId: id,
      action: isArchived ? "archive" : "restore",
    });
  });
}

/** The interface may say Delete; this is what actually happens (§10.2). */
export function archiveRecord(
  actorId: string,
  type: ArchivableType,
  id: string,
  select: DelegateSelector,
) {
  return setArchived(actorId, type, id, select, true);
}

/** Admin-only restore (AC-15). */
export function restoreRecord(
  actorId: string,
  type: ArchivableType,
  id: string,
  select: DelegateSelector,
) {
  return setArchived(actorId, type, id, select, false);
}
