"use server";

import { revalidatePath } from "next/cache";
import { formInput } from "@/lib/validation/form";
import { isAppError } from "@/lib/errors";
import { requireAdmin } from "@/server/auth/guards";
import {
  archiveForm,
  createForm,
  findDuplicateUrl,
  restoreForm,
  updateForm,
} from "./service";

/**
 * Server actions for the Forms UI. Thin wrappers: they validate, guard, and call the
 * same services the route handlers call — no rule is implemented twice.
 */

export type FormActionResult =
  | { ok: true; id: string }
  /** FR-F08 — a warning, not a block. The dialog re-submits with `acknowledgeDuplicate`. */
  | { ok: false; kind: "duplicate"; existingName: string }
  | { ok: false; kind: "error"; message: string; fieldErrors?: Record<string, string> };

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function saveFormAction(
  _prev: FormActionResult | null,
  formData: FormData,
): Promise<FormActionResult> {
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const parsed = formInput.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
    company: formData.get("company"),
    notes: formData.get("notes") || undefined,
    acknowledgeDuplicate: formData.get("acknowledgeDuplicate") === "true",
  });

  if (!parsed.success) {
    return {
      ok: false,
      kind: "error",
      message: "VALIDATION_FAILED",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const { acknowledgeDuplicate, ...fields } = parsed.data;

  if (!acknowledgeDuplicate) {
    const clash = await findDuplicateUrl(fields.url, id || undefined);
    if (clash) return { ok: false, kind: "duplicate", existingName: clash.name };
  }

  try {
    const saved = id
      ? await updateForm(admin.id, id, fields)
      : await createForm(admin.id, fields);
    revalidatePath("/forms");
    revalidatePath("/archive");
    return { ok: true, id: saved.id };
  } catch (e) {
    if (isAppError(e)) return { ok: false, kind: "error", message: e.message };
    throw e;
  }
}

export async function archiveFormAction(id: string): Promise<{ ok: boolean; message?: string }> {
  const admin = await requireAdmin();
  try {
    await archiveForm(admin.id, id);
    revalidatePath("/forms");
    revalidatePath("/archive");
    return { ok: true };
  } catch (e) {
    if (isAppError(e)) return { ok: false, message: e.message };
    throw e;
  }
}

export async function restoreFormAction(id: string): Promise<{ ok: boolean; message?: string }> {
  const admin = await requireAdmin();
  try {
    await restoreForm(admin.id, id);
    revalidatePath("/forms");
    revalidatePath("/archive");
    return { ok: true };
  } catch (e) {
    if (isAppError(e)) return { ok: false, message: e.message };
    throw e;
  }
}
