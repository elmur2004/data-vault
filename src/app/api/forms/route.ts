import type { NextRequest } from "next/server";
import { requireAdmin, requireUser } from "@/server/auth/guards";
import { handle, parseOr422, readBody } from "@/server/http";
import { formInput, formListParams } from "@/lib/validation/form";
import { createForm, findDuplicateUrl, listForms } from "@/server/forms/service";
import { ConflictError } from "@/lib/errors";

/** Any signed-in user may read (§3.1). */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireUser();
    const params = formListParams.parse(Object.fromEntries(request.nextUrl.searchParams));
    return listForms(params);
  });
}

/**
 * BR-10 — only admins create forms. An employee POSTing here gets 403 whatever the
 * UI rendered, which is the whole point of enforcing server-side (NFR-07).
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await readBody(request);
    const input = parseOr422(formInput, body);

    // FR-F08 — warn, don't block. The caller resubmits with acknowledgeDuplicate.
    if (!input.acknowledgeDuplicate) {
      const clash = await findDuplicateUrl(input.url);
      if (clash) {
        throw new ConflictError(`"${clash.name}" already uses that address.`);
      }
    }

    const { acknowledgeDuplicate: _ack, ...fields } = input;
    return createForm(admin.id, fields);
  });
}
