import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { writeActivity } from "@/server/activity/log";
import { archiveRecord, NOT_ARCHIVED, restoreRecord } from "@/server/archive/service";
import { orderByFrom, paginate, toPage, type ListParams } from "@/lib/validation/common";
import { FORM_SORTS, type FormInput } from "@/lib/validation/form";

/**
 * Forms (SPEC §7, FR-F01..F08).
 *
 * Listing runs entirely in the database — filter, search, sort and page (R-3). NFR-01
 * wants any table under 1.5 s at 2,000 rows, and doing this client-side would not hold.
 * Sheets and Documents inherit the same shape.
 */

type FormFields = Omit<FormInput, "acknowledgeDuplicate">;

export async function listForms(params: ListParams) {
  const where: Prisma.FormWhereInput = {
    // BR-11: archived records are out of every default view and every count.
    isArchived: params.archived,
    ...(params.company ? { company: params.company } : {}),
    ...(params.q
      ? {
          // FR-F07 — free text across name and notes.
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { notes: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy = orderByFrom(params.sort, params.dir, FORM_SORTS, { createdAt: "desc" });
  const { skip, take } = paginate(params);

  const [rows, total] = await Promise.all([
    db.form.findMany({ where, orderBy, skip, take }),
    db.form.count({ where }),
  ]);

  return toPage(rows, total, params);
}

export async function getForm(id: string) {
  const form = await db.form.findUnique({ where: { id } });
  if (!form) throw new NotFoundError("That form does not exist.");
  return form;
}

/**
 * FR-F08 — warn when the same URL already exists on another form. A *warning*: the
 * spec says warn, so this reports the clash and the caller decides. Duplicate links
 * are sometimes legitimate (the same form filed under two names).
 */
export async function findDuplicateUrl(url: string, exceptId?: string) {
  return db.form.findFirst({
    where: {
      url,
      ...NOT_ARCHIVED,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true, name: true },
  });
}

export async function createForm(actorId: string, input: FormFields) {
  return db.$transaction(async (tx) => {
    const form = await tx.form.create({ data: { ...input, createdBy: actorId } });
    await writeActivity(tx, {
      actorId,
      entityType: "form",
      entityId: form.id,
      action: "create",
      meta: { name: form.name, company: form.company },
    });
    return form;
  });
}

export async function updateForm(actorId: string, id: string, input: FormFields) {
  const before = await db.form.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("That form does not exist.");

  return db.$transaction(async (tx) => {
    const form = await tx.form.update({ where: { id }, data: input });
    await writeActivity(tx, {
      actorId,
      entityType: "form",
      entityId: id,
      action: "update",
      meta: {
        before: { name: before.name, url: before.url, company: before.company, notes: before.notes },
        after: input,
      },
    });
    return form;
  });
}

/** BR-11 / AC-15 — the interface may say Delete; this is what happens. */
export function archiveForm(actorId: string, id: string) {
  return archiveRecord(actorId, "form", id, (tx) => tx.form);
}

export function restoreForm(actorId: string, id: string) {
  return restoreRecord(actorId, "form", id, (tx) => tx.form);
}
