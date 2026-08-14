"use server";

import { revalidatePath } from "next/cache";
import { sheetInput } from "@/lib/validation/sheet";
import { isAppError } from "@/lib/errors";
import { requireAdmin } from "@/server/auth/guards";
import { archiveSheet, createSheet, restoreSheet, updateSheet, uploadSheetFile } from "./service";

export type SheetActionResult =
  | { ok: true; id: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Upload a spreadsheet and read its record count in one step (FR-S05/AC-04).
 * Called before the sheet is saved, so the dialog can show the number it found and
 * explain how it read the file (ambiguity A-1).
 */
export async function uploadSheetFileAction(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  const previousFileId = String(formData.get("previousFileId") ?? "") || undefined;
  if (!(file instanceof File)) return { ok: false as const, message: "No file supplied." };

  const admin = await requireAdmin();
  try {
    const result = await uploadSheetFile({ file, uploadedBy: admin.id, previousFileId });
    return {
      ok: true as const,
      fileId: result.file.id,
      filename: result.file.originalFilename,
      count: result.lastRecordCount,
      asOf: result.lastRecordCountAsOf?.toISOString() ?? null,
      headerDetected: result.headerDetected,
      countable: result.countable,
    };
  } catch (e) {
    if (isAppError(e)) return { ok: false as const, message: e.message };
    throw e;
  }
}

export async function saveSheetAction(
  _prev: SheetActionResult | null,
  formData: FormData,
): Promise<SheetActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const storageMode = String(formData.get("storageMode") ?? "LINK");
  const raw: Record<string, unknown> = {
    name: formData.get("name"),
    dateCreated: formData.get("dateCreated"),
    company: formData.get("company"),
    type: formData.get("type"),
    notes: formData.get("notes") || undefined,
    storageMode,
  };

  if (storageMode === "LINK") {
    raw.url = formData.get("url");
    // A manual count is only offered for links — uploads compute their own.
    const count = formData.get("lastRecordCount");
    if (count) {
      raw.lastRecordCount = count;
      raw.lastRecordCountAsOf = formData.get("lastRecordCountAsOf") || undefined;
    }
  } else {
    raw.fileId = formData.get("fileId");
  }

  const parsed = sheetInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: "VALIDATION_FAILED",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  // For an upload, the count came from the file itself.
  const computedCount = formData.get("computedCount");
  const computedAsOf = formData.get("computedAsOf");
  const computed =
    parsed.data.storageMode === "FILE"
      ? {
          lastRecordCount: computedCount ? Number(computedCount) : null,
          lastRecordCountAsOf: computedAsOf ? new Date(String(computedAsOf)) : null,
        }
      : undefined;

  try {
    const saved = id
      ? await updateSheet(admin.id, id, { input: parsed.data, computed })
      : await createSheet(admin.id, { input: parsed.data, computed });
    revalidatePath("/sheets");
    revalidatePath("/archive");
    return { ok: true, id: saved.id };
  } catch (e) {
    if (isAppError(e)) return { ok: false, message: e.message };
    throw e;
  }
}

export async function archiveSheetAction(id: string) {
  const admin = await requireAdmin();
  try {
    await archiveSheet(admin.id, id);
    revalidatePath("/sheets");
    revalidatePath("/archive");
    return { ok: true as const };
  } catch (e) {
    if (isAppError(e)) return { ok: false as const, message: e.message };
    throw e;
  }
}

export async function restoreSheetAction(id: string) {
  const admin = await requireAdmin();
  await restoreSheet(admin.id, id);
  revalidatePath("/sheets");
  revalidatePath("/archive");
  return { ok: true as const };
}
