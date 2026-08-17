import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived download links for locally stored files.
 *
 * BR-14 / AC-05 require that a file is reachable "only through signed URLs valid for
 * 5 minutes, generated per request against the requester's permissions". With object
 * storage that signature came from S3. On local disk we mint and verify it ourselves,
 * and the guarantee is the same one:
 *
 *   • the link carries no filesystem path, only the opaque storage key
 *   • it expires at a fixed instant, checked on every use
 *   • the signature covers the key, the expiry, and the disposition, so none of them
 *     can be altered after the fact — swapping `attachment` for `inline`, pointing at
 *     a different key, or extending the deadline all invalidate it
 *   • it is verified in constant time
 *
 * The secret is the app's auth secret unless a dedicated one is provided. It never
 * leaves the server, so a link cannot be forged by anyone who has not already been
 * authorised by the route that issued it.
 */

function secret(): string {
  const value = process.env.FILE_SIGNING_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "FILE_SIGNING_SECRET or BETTER_AUTH_SECRET must be set to at least 16 characters — downloads cannot be signed without it.",
    );
  }
  return value;
}

export type SignedParts = {
  key: string;
  expires: number; // epoch seconds
  disposition: "attachment" | "inline";
  filename: string;
  /**
   * Signed too, and this matters: if the response's content type came from an unsigned
   * parameter, a valid link could be re-pointed at a different rendering — inline
   * `text/html` being the obvious abuse. Covering it means the type served is the one
   * the server chose when it authorised the request.
   */
  contentType: string;
};

function payload(parts: SignedParts): string {
  // Newline-separated and order-fixed so no field can be smuggled into another.
  return [
    parts.key,
    String(parts.expires),
    parts.disposition,
    parts.filename,
    parts.contentType,
  ].join("\n");
}

export function sign(parts: SignedParts): string {
  return createHmac("sha256", secret()).update(payload(parts)).digest("base64url");
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "bad-signature" | "malformed" };

export function verify(parts: SignedParts, signature: string): VerifyResult {
  if (!signature || !parts.key || !Number.isFinite(parts.expires)) {
    return { ok: false, reason: "malformed" };
  }

  // Expiry first: an expired link is refused even if the signature is perfect.
  if (Math.floor(Date.now() / 1000) > parts.expires) return { ok: false, reason: "expired" };

  const expected = Buffer.from(sign(parts));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "bad-signature" };
  }
  return { ok: true };
}
