import { NextResponse, type NextRequest } from "next/server";
import { toHttpError } from "@/lib/errors";
import { requireUser } from "@/server/auth/guards";
import { authorizeFileAccess } from "@/server/files/authorize";
import { issueDownloadUrl } from "@/server/files/service";
import "@/server/files/owners";

/**
 * The only way a stored file reaches a browser (BR-14 / AC-05).
 *
 * Authenticate → authorise against the *owning record* → mint a 300-second presigned
 * URL → redirect. The storage key never reaches the client, and the URL is never
 * stored or cached.
 *
 * `?disposition=inline` serves the PDF preview (FR-D05); the default saves the file.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    await authorizeFileAccess(user, id);

    const inline = request.nextUrl.searchParams.get("disposition") === "inline";
    const { url } = await issueDownloadUrl({
      fileId: id,
      disposition: inline ? "inline" : "attachment",
    });

    // 307 keeps the method and makes it obvious this is a hand-off, not the file.
    return NextResponse.redirect(url, {
      status: 307,
      headers: { "cache-control": "no-store, private" },
    });
  } catch (e) {
    const { status, body } = toHttpError(e);
    return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
  }
}
