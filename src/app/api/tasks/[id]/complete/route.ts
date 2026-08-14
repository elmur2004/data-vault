import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/guards";
import { handle, parseOr422, readBody } from "@/server/http";
import { resultPayload } from "@/lib/validation/task";
import { completeTask } from "@/server/tasks/complete";

/**
 * **AC-08.** Send a completion request straight at this endpoint for a task with no
 * result and it returns **422**, with the task still open — regardless of what any
 * client claimed and regardless of the fact that the UI would never have offered the
 * button. The UI is not the enforcement layer (BR-05, NFR-07).
 *
 * The same endpoint carries the result panel's payload, so saving a result and
 * completing the task are one action, not two (§9.3).
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readBody(request);
    // An empty body is legitimate: completing a task that already has a result.
    const payload = parseOr422(resultPayload, body ?? {});
    return completeTask(user, (await ctx.params).id, payload);
  });
}
