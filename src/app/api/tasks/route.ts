import type { NextRequest } from "next/server";
import { requireAdmin, requireUser } from "@/server/auth/guards";
import { handle, parseOr422, readBody } from "@/server/http";
import { taskInput, taskListParams } from "@/lib/validation/task";
import { createTask, listTasks } from "@/server/tasks/service";

/**
 * AC-13 — an employee's list contains only their own tasks. The scoping is applied in
 * the query inside listTasks, so another employee's row is never in the payload.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const params = taskListParams.parse(Object.fromEntries(request.nextUrl.searchParams));
    return listTasks(user, params);
  });
}

/** FR-T02 — admin only (§3.1). An employee POSTing here gets 403. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const admin = await requireAdmin();
    const input = parseOr422(taskInput, await readBody(request));
    return createTask(admin.id, input);
  });
}
