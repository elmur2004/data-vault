"use server";

import { revalidatePath } from "next/cache";
import { documentInput } from "@/lib/validation/document";
import { isAppError } from "@/lib/errors";
import { requireAdmin } from "@/server/auth/guards";
import {
  archiveDocument,
  createDocument,
  restoreDocument,
  updateDocument,
  uploadDocumentFile,
} from "./service";

export type DocumentActionResult =
  | { ok: true; id: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export async function uploadDocumentFileAction(formData: FormData) {
  const admin = await requireAdmin();
  const file = formData.get("file");
  const previousFileId = String(formData.get("previousFileId") ?? "") || undefined;
  if (!(file instanceof File)) return { ok: false as const, message: "No file supplied." };

  try {
    const { file: stored } = await uploadDocumentFile({
      file,
      uploadedBy: admin.id,
      previousFileId,
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

export async function saveDocumentAction(
  _prev: DocumentActionResult | null,
  formData: FormData,
): Promise<DocumentActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const parsed = documentInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    company: formData.get("company"),
    type: formData.get("type"),
    fileId: formData.get("fileId"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "VALIDATION_FAILED", fieldErrors };
  }

  try {
    const saved = id
      ? await updateDocument(admin.id, id, parsed.data)
      : await createDocument(admin.id, parsed.data);
    revalidatePath("/documents");
    revalidatePath("/archive");
    return { ok: true, id: saved.id };
  } catch (e) {
    if (isAppError(e)) return { ok: false, message: e.message };
    throw e;
  }
}

export async function archiveDocumentAction(id: string) {
  const admin = await requireAdmin();
  try {
    await archiveDocument(admin.id, id);
    revalidatePath("/documents");
    revalidatePath("/archive");
    return { ok: true as const };
  } catch (e) {
    if (isAppError(e)) return { ok: false as const, message: e.message };
    throw e;
  }
}

export async function restoreDocumentAction(id: string) {
  const admin = await requireAdmin();
  await restoreDocument(admin.id, id);
  revalidatePath("/documents");
  revalidatePath("/archive");
  return { ok: true as const };
}
