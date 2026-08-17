import { NextResponse, type NextRequest } from "next/server";
import { getObject } from "@/server/files/storage";
import { verify } from "@/server/files/signing";

/**
 * Serves a locally stored file against a signed, expiring link (BR-14 / AC-05).
 *
 * This is the filesystem equivalent of an S3 presigned URL, and it is deliberately the
 * *only* way bytes leave the storage directory. It grants nothing on its own: the link
 * is minted by `/api/files/[id]`, which authenticates the caller and checks that they
 * may see the record owning the file. By the time a request arrives here, that decision
 * has already been made and is carried by the signature.
 *
 * Refuses, with no detail, when the link is expired, altered, or unsigned. It says
 * nothing about whether the key exists — a 403 for a forged link and a 403 for a real
 * one look identical, so this cannot be used to enumerate storage.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const key = p.get("k") ?? "";
  const expires = Number(p.get("e") ?? 0);
  const disposition = p.get("d") === "inline" ? "inline" : "attachment";
  const filename = p.get("n") ?? "download";
  const contentType = p.get("t") ?? "application/octet-stream";
  const signature = p.get("s") ?? "";

  // Every value that shapes the response is covered by the signature, so altering any
  // of them — the key, the expiry, the disposition, the name, the type — invalidates it.
  const result = verify({ key, expires, disposition, filename, contentType }, signature);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason === "expired" ? "LINK_EXPIRED" : "FORBIDDEN",
        message:
          result.reason === "expired"
            ? "That download link has expired. Open the file again to get a new one."
            : "That download link is not valid.",
      },
      { status: result.reason === "expired" ? 410 : 403, headers: { "cache-control": "no-store" } },
    );
  }

  let body: Buffer;
  try {
    body = await getObject(key);
  } catch {
    // A validly signed link for a missing object is still not something to describe.
    return NextResponse.json(
      { error: "FORBIDDEN", message: "That file is not available." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  const safeAscii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      // Safe to use: the type is part of the signed payload above, so it is the one
      // the server chose, not one a caller supplied.
      "content-type": contentType,
      "content-length": String(body.byteLength),
      "content-disposition": `${disposition}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`,
      // Never cached by a shared cache: the link is per-request and short-lived.
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}
