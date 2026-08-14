import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { writeActivity } from "@/server/activity/log";
import { archiveRecord, restoreRecord } from "@/server/archive/service";
import { orderByFrom, paginate, toPage } from "@/lib/validation/common";
import { DOCUMENT_SORTS, type DocumentInput, type DocumentListParams } from "@/lib/validation/document";
import { logReplacement, replaceUpload, storeUpload } from "@/server/files/service";

/** Documents (SPEC §8.2, FR-D01..D09). The third table, and the cheapest — by design. */

export async function listDocuments(params: DocumentListParams) {
  const where: Prisma.DocumentWhereInput = {
    isArchived: params.archived,
    ...(params.company ? { company: params.company } : {}),
    ...(params.type ? { type: params.type } : {}),
    ...(params.q
      ? {
          // FR-D08 — free text across name and description.
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { description: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy = orderByFrom(params.sort, params.dir, DOCUMENT_SORTS, { createdAt: "desc" });
  const { skip, take } = paginate(params);

  const [rows, total] = await Promise.all([
    db.document.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        file: { select: { id: true, originalFilename: true, sizeBytes: true, mimeType: true, version: true } },
      },
    }),
    db.document.count({ where }),
  ]);

  return toPage(rows, total, params);
}

export async function getDocument(id: string) {
  const doc = await db.document.findUnique({ where: { id }, include: { file: true } });
  if (!doc) throw new NotFoundError("That document does not exist.");
  return doc;
}

/** FR-D03 — PDF, DOCX, XLSX up to 25 MB, validated by content (BR-04). */
export async function uploadDocumentFile(opts: {
  file: File;
  uploadedBy: string;
  previousFileId?: string;
}) {
  return opts.previousFileId
    ? replaceUpload({
        scope: "document",
        file: opts.file,
        uploadedBy: opts.uploadedBy,
        previousFileId: opts.previousFileId,
      })
    : storeUpload({ scope: "document", file: opts.file, uploadedBy: opts.uploadedBy });
}

export async function createDocument(actorId: string, input: DocumentInput) {
  return db.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        company: input.company,
        type: input.type,
        fileId: input.fileId,
        createdBy: actorId,
      },
    });
    await writeActivity(tx, {
      actorId,
      entityType: "document",
      entityId: doc.id,
      action: "create",
      meta: { name: doc.name, type: doc.type, company: doc.company },
    });
    return doc;
  });
}

export async function updateDocument(actorId: string, id: string, input: DocumentInput) {
  const before = await db.document.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("That document does not exist.");

  return db.$transaction(async (tx) => {
    const doc = await tx.document.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description ?? null,
        company: input.company,
        type: input.type,
        fileId: input.fileId,
      },
    });

    await writeActivity(tx, {
      actorId,
      entityType: "document",
      entityId: id,
      action: "update",
      meta: {
        before: { name: before.name, type: before.type, description: before.description },
        after: { name: doc.name, type: doc.type, description: doc.description },
      },
    });

    // FR-D06 — replacing the file keeps the previous version, and says so in the log.
    if (before.fileId !== input.fileId) {
      const created = await tx.storedFile.findUnique({ where: { id: input.fileId } });
      await logReplacement(tx, {
        actorId,
        entityType: "document",
        entityId: id,
        previousFileId: before.fileId,
        newFileId: input.fileId,
        version: created?.version ?? 1,
      });
    }

    return doc;
  });
}

export function archiveDocument(actorId: string, id: string) {
  return archiveRecord(actorId, "document", id, (tx) => tx.document);
}

export function restoreDocument(actorId: string, id: string) {
  return restoreRecord(actorId, "document", id, (tx) => tx.document);
}
