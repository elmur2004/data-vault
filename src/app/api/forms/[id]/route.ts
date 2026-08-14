import type { NextRequest } from "next/server";
import { requireAdmin, requireUser } from "@/server/auth/guards";
import { handle, parseOr422, readBody } from "@/server/http";
import { formInput } from "@/lib/validation/form";
import { archiveForm, getForm, updateForm } from "@/server/forms/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireUser();
    return getForm((await ctx.params).id);
  });
}

/** FR-F05 — edit is admin only (BR-10). */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const input = parseOr422(formInput, await readBody(request));
    const { acknowledgeDuplicate: _ack, ...fields } = input;
    return updateForm(admin.id, (await ctx.params).id, fields);
  });
}

/**
 * BR-11 / AC-15 — DELETE archives. The verb is the one clients expect; the behaviour
 * underneath is archival, and the record stays restorable.
 */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    await archiveForm(admin.id, (await ctx.params).id);
    return { ok: true, archived: true };
  });
}
