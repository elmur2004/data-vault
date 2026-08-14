import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/guards";
import { handle } from "@/server/http";
import { search } from "@/server/search/service";

/** §10.1 / AC-17 — results grouped by section, scoped to the requester. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const term = request.nextUrl.searchParams.get("q") ?? "";
    return search(user, term);
  });
}
