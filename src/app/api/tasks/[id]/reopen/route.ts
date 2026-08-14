import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/guards";
import { handle } from "@/server/http";
import { reopenTask } from "@/server/tasks/complete";

/**
 * **AC-14** — an employee attempting to reopen their own completed task gets **403**.
 * BR-08 makes reopening admin-only, and reopenTask enforces that itself rather than
 * relying on this route, so no future caller can skip the check.
 */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    return reopenTask(user, (await ctx.params).id);
  });
}
