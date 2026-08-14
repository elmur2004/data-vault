import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { NotFoundError, UnprocessableError } from "@/lib/errors";
import { writeActivity } from "@/server/activity/log";
import { archiveRecord, restoreRecord } from "@/server/archive/service";
import { orderByFrom, paginate, toPage } from "@/lib/validation/common";
import { SHEET_SORTS, type SheetInput, type SheetListParams } from "@/lib/validation/sheet";
import { replaceUpload, storeUpload, logReplacement } from "@/server/files/service";
import { countRecords } from "./row-count";
import { todayInCairo } from "@/lib/datetime";

/**
 * Sheets (SPEC §8.1, FR-S01..S09).
 *
 * The interesting parts are BR-02 (a link *or* a file, never both, never neither) and
 * FR-S05 (the record count computed from the file so it does not rot).
 */

export async function listSheets(params: SheetListParams) {
  const where: Prisma.SheetWhereInput = {
    isArchived: params.archived,
    ...(params.company ? { company: params.company } : {}),
    ...(params.type ? { type: params.type } : {}),
    ...(params.q
      ? {
          // FR-S08 — free text across name and notes.
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { notes: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy = orderByFrom(params.sort, params.dir, SHEET_SORTS, { dateCreated: "desc" });
  const { skip, take } = paginate(params);

  const [rows, total] = await Promise.all([
    db.sheet.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { file: { select: { id: true, originalFilename: true, sizeBytes: true, version: true } } },
    }),
    db.sheet.count({ where }),
  ]);

  return toPage(rows, total, params);
}

export async function getSheet(id: string) {
  const sheet = await db.sheet.findUnique({ where: { id }, include: { file: true } });
  if (!sheet) throw new NotFoundError("That sheet does not exist.");
  return sheet;
}

/**
 * Uploads a spreadsheet and counts its rows in one step (FR-S05/AC-04).
 * Returns both so the caller can store the count alongside the file reference.
 */
export async function uploadSheetFile(opts: {
  file: File;
  uploadedBy: string;
  previousFileId?: string;
}) {
  const buffer = Buffer.from(await opts.file.arrayBuffer());

  const stored = opts.previousFileId
    ? await replaceUpload({
        scope: "sheet",
        file: opts.file,
        uploadedBy: opts.uploadedBy,
        previousFileId: opts.previousFileId,
      })
    : await storeUpload({ scope: "sheet", file: opts.file, uploadedBy: opts.uploadedBy });

  const counted = await countRecords(buffer, stored.detectedExt);

  return {
    file: stored.file,
    detectedExt: stored.detectedExt,
    // AC-04: as-of is today when the count came from the file.
    lastRecordCount: counted.countable ? counted.count : null,
    lastRecordCountAsOf: counted.countable ? todayInCairo() : null,
    headerDetected: counted.headerDetected,
    countable: counted.countable,
  };
}

type CreateArgs = {
  input: SheetInput;
  /** Present when storageMode is FILE — already uploaded and counted. */
  computed?: { lastRecordCount: number | null; lastRecordCountAsOf: Date | null };
};

export async function createSheet(actorId: string, { input, computed }: CreateArgs) {
  // BR-02 re-checked here, not just in zod: the server never trusts what it was sent.
  assertStorageExclusive(input);

  const data: Prisma.SheetCreateInput = {
    name: input.name,
    storageMode: input.storageMode,
    dateCreated: input.dateCreated,
    company: input.company,
    type: input.type,
    notes: input.notes ?? null,
    createdBy: actorId,
    ...(input.storageMode === "LINK"
      ? { url: input.url }
      : { file: { connect: { id: input.fileId } } }),
    ...(computed
      ? {
          lastRecordCount: computed.lastRecordCount,
          lastRecordCountAsOf: computed.lastRecordCountAsOf,
        }
      : {
          lastRecordCount: input.lastRecordCount ?? null,
          lastRecordCountAsOf: input.lastRecordCountAsOf ?? null,
        }),
  };

  return db.$transaction(async (tx) => {
    const sheet = await tx.sheet.create({ data });
    await writeActivity(tx, {
      actorId,
      entityType: "sheet",
      entityId: sheet.id,
      action: "create",
      meta: { name: sheet.name, storageMode: sheet.storageMode, type: sheet.type },
    });
    return sheet;
  });
}

export async function updateSheet(actorId: string, id: string, { input, computed }: CreateArgs) {
  assertStorageExclusive(input);

  const before = await db.sheet.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("That sheet does not exist.");

  return db.$transaction(async (tx) => {
    const sheet = await tx.sheet.update({
      where: { id },
      data: {
        name: input.name,
        storageMode: input.storageMode,
        dateCreated: input.dateCreated,
        company: input.company,
        type: input.type,
        notes: input.notes ?? null,
        ...(input.storageMode === "LINK"
          ? { url: input.url, file: { disconnect: true } }
          : { url: null, file: { connect: { id: input.fileId } } }),
        ...(computed
          ? {
              lastRecordCount: computed.lastRecordCount,
              lastRecordCountAsOf: computed.lastRecordCountAsOf,
            }
          : {
              lastRecordCount: input.lastRecordCount ?? null,
              lastRecordCountAsOf: input.lastRecordCountAsOf ?? null,
            }),
      },
    });

    await writeActivity(tx, {
      actorId,
      entityType: "sheet",
      entityId: id,
      action: "update",
      meta: { before: { name: before.name, storageMode: before.storageMode }, after: { name: sheet.name } },
    });

    // FR-S06 — a replaced file keeps its predecessor, and the swap is logged.
    if (before.fileId && input.storageMode === "FILE" && input.fileId !== before.fileId) {
      const created = await tx.storedFile.findUnique({ where: { id: input.fileId } });
      await logReplacement(tx, {
        actorId,
        entityType: "sheet",
        entityId: id,
        previousFileId: before.fileId,
        newFileId: input.fileId,
        version: created?.version ?? 1,
      });
    }

    return sheet;
  });
}

/** BR-02 in code, mirroring the zod union and the Postgres CHECK. */
function assertStorageExclusive(input: SheetInput) {
  const hasUrl = input.storageMode === "LINK" && Boolean(input.url);
  const hasFile = input.storageMode === "FILE" && Boolean(input.fileId);
  if (hasUrl === hasFile) {
    throw new UnprocessableError(
      "SHEET_STORAGE_EXCLUSIVE",
      "A sheet needs either a link or an uploaded file — one of the two, not both and not neither.",
    );
  }
}

export function archiveSheet(actorId: string, id: string) {
  return archiveRecord(actorId, "sheet", id, (tx) => tx.sheet);
}

export function restoreSheet(actorId: string, id: string) {
  return restoreRecord(actorId, "sheet", id, (tx) => tx.sheet);
}
