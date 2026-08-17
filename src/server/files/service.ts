import "server-only";
import { randomUUID } from "node:crypto";
import type { StoredFile } from "@prisma/client";
import { db, type AnyDb } from "@/lib/db";
import { ForbiddenError, UnprocessableError } from "@/lib/errors";
import { writeActivity } from "@/server/activity/log";
import { allowedLabel, detectType, isAllowed, type UploadScope } from "./inspect";
import { scanBuffer } from "./scan";
import { deleteObject, putObject, signedDownloadUrl } from "./storage";

/**
 * The upload pipeline (§10.3). Every upload in the app goes through `storeUpload` -
 * Sheets, Documents and task attachments alike. There is no bypass.
 *
 *   size - content inspection - persist (with compensating cleanup) - scan - row count
 *
 * SPEC §17 is explicit that improvising this per section is the piece most likely to
 * need rework, which is why it exists before any section that uses it.
 */

type Client = AnyDb;

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 25);
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/**
 * Strips directories and control characters, collapses whitespace, caps at 255.
 * The result is only ever used for display and Content-Disposition - never as part
 * of the storage key.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned.length ? cleaned : "file").slice(0, 255);
}

export type StoreResult = { file: StoredFile; detectedExt: string };

/**
 * Validates and stores one upload, returning the StoredFile row.
 *
 * On S3 failure nothing is written to the database; on database failure the object is
 * deleted again. There is never an orphaned row pointing at a missing object, nor an
 * unreferenced object left behind by a failed insert.
 */
export async function storeUpload(opts: {
  scope: UploadScope;
  file: File;
  uploadedBy: string;
}): Promise<StoreResult> {
  const { scope, file, uploadedBy } = opts;

  // 1. Size - checked before anything expensive happens.
  if (file.size > MAX_BYTES) {
    throw new UnprocessableError(
      "FILE_TOO_LARGE",
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_MB} MB.`,
    );
  }
  if (file.size === 0) {
    throw new UnprocessableError("FILE_TYPE_REJECTED", "That file is empty.");
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // 2. Content inspection (BR-04/AC-06) - the extension is a hint, never the verdict.
  const detected = await detectType(buf, file.name);
  if (!detected) {
    throw new UnprocessableError(
      "FILE_TYPE_REJECTED",
      `We could not identify that file. Accepted here: ${allowedLabel(scope)}.`,
    );
  }
  if (!isAllowed(scope, detected.ext)) {
    throw new UnprocessableError(
      "FILE_TYPE_REJECTED",
      `That file is actually ${detected.ext.toUpperCase()}, whatever it is named. Accepted here: ${allowedLabel(scope)}.`,
    );
  }

  // 3. Persist. Key is non-guessable and carries nothing from the filename.
  const storageKey = `${scope}s/${randomUUID()}`;
  await putObject(storageKey, buf, detected.mime);

  let stored: StoredFile;
  try {
    stored = await db.storedFile.create({
      data: {
        originalFilename: sanitizeFilename(file.name),
        storageKey,
        mimeType: detected.mime,
        sizeBytes: buf.byteLength,
        uploadedBy,
        scanStatus: "PENDING",
      },
    });
  } catch (e) {
    await deleteObject(storageKey).catch(() => {});
    throw e;
  }

  // 4. Scan. Only CLEAN files are ever servable; a rejected one is removed outright.
  const verdict = await scanBuffer(buf);
  if (verdict === "REJECTED") {
    await deleteObject(storageKey).catch(() => {});
    await db.storedFile.update({ where: { id: stored.id }, data: { scanStatus: "REJECTED" } });
    throw new UnprocessableError(
      "FILE_NOT_CLEAN",
      "That file was rejected by the malware scanner and has not been stored.",
    );
  }
  stored = await db.storedFile.update({
    where: { id: stored.id },
    data: { scanStatus: verdict },
  });

  return { file: stored, detectedExt: detected.ext };
}

/**
 * Replacement (FR-S06/FR-D06). A new StoredFile is created with `version + 1` and a
 * `replacesId` pointing at the old one; the old row and its object are kept forever.
 * The caller repoints its own `fileId` in the same transaction.
 */
export async function replaceUpload(opts: {
  scope: UploadScope;
  file: File;
  uploadedBy: string;
  previousFileId: string;
}): Promise<StoreResult> {
  const previous = await db.storedFile.findUnique({ where: { id: opts.previousFileId } });
  if (!previous) throw new UnprocessableError("VALIDATION_FAILED", "The file being replaced is missing.");

  const result = await storeUpload(opts);

  const linked = await db.storedFile.update({
    where: { id: result.file.id },
    data: { version: previous.version + 1, replacesId: previous.id },
  });

  return { ...result, file: linked };
}

/** The version chain, newest first. Admin-only surface. */
export async function fileVersions(fileId: string): Promise<StoredFile[]> {
  const chain: StoredFile[] = [];
  let current = await db.storedFile.findUnique({ where: { id: fileId } });
  while (current) {
    chain.push(current);
    current = current.replacesId
      ? await db.storedFile.findUnique({ where: { id: current.replacesId } })
      : null;
  }
  return chain;
}

/**
 * BR-14 / AC-05 - mints a download URL.
 *
 * Callers must have already authorised the *owning record* (a document, a sheet, a
 * task attachment); this enforces the two rules that belong to the file itself:
 * the file must exist and must be CLEAN.
 */
export async function issueDownloadUrl(opts: {
  fileId: string;
  disposition?: "attachment" | "inline";
}): Promise<{ url: string; file: StoredFile }> {
  const file = await db.storedFile.findUnique({ where: { id: opts.fileId } });
  if (!file) throw new ForbiddenError();

  if (file.scanStatus !== "CLEAN") {
    throw new UnprocessableError(
      "FILE_NOT_CLEAN",
      "That file is still being checked and cannot be downloaded yet.",
    );
  }

  const url = await signedDownloadUrl({
    key: file.storageKey,
    filename: file.originalFilename,
    contentType: file.mimeType,
    ...(opts.disposition ? { disposition: opts.disposition } : {}),
  });

  return { url, file };
}

/** Logs a file replacement against the owning entity, inside its transaction. */
export async function logReplacement(
  tx: Client,
  opts: {
    actorId: string;
    entityType: "sheet" | "document" | "task";
    entityId: string;
    previousFileId: string;
    newFileId: string;
    version: number;
  },
) {
  await writeActivity(tx, {
    actorId: opts.actorId,
    entityType: opts.entityType,
    entityId: opts.entityId,
    action: "replace_file",
    meta: {
      previousFileId: opts.previousFileId,
      newFileId: opts.newFileId,
      version: opts.version,
    },
  });
}
