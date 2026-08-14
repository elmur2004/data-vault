import type { NextRequest } from "next/server";
import { requireAdmin, requireUser } from "@/server/auth/guards";
import { handle, parseOr422, readBody } from "@/server/http";
import { taskInput } from "@/lib/validation/task";
import { archiveTask, getTask, updateTask } from "@/server/tasks/service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * AC-13 — a direct request for another employee's task returns **403**.
 * getTask scopes the query, so a miss is indistinguishable from "not yours": the
 * response never reveals whether the id exists.
 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    return getTask(user, (await ctx.params).id);
  });
}

/** FR-T12 — edit and reassign are admin only. AC-12: this never touches stored lateness. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const input = parseOr422(taskInput, await readBody(request));
    return updateTask(admin.id, (await ctx.params).id, input);
  });
}

/** BR-11 — archives rather than deletes. */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    await archiveTask(admin.id, (await ctx.params).id);
    return { ok: true, archived: true };
  });
}
