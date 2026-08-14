import "server-only";
import { ForbiddenError } from "@/lib/errors";
import type { SessionUser } from "@/server/auth/guards";

/**
 * BR-14 / AC-05 — a signed URL is issued "per request against the requester's
 * permissions". This decides those permissions by asking who *owns* the file.
 *
 * **Fails closed.** A file nobody owns is unreachable by everybody, which is what
 * makes an abandoned upload harmless: guessing its id gets you a 403, not a download.
 *
 * Owners register here as their milestones land:
 *   M4 sheets     — readable by any signed-in user (§3.1: everyone reads)
 *   M5 documents  — readable by any signed-in user
 *   M6 task files — task scoping applies (BR-09/AC-13: employees, only their own)
 */
type OwnerResolver = (
  user: SessionUser,
  fileId: string,
) => Promise<"allow" | "deny" | "not-owner">;

const resolvers: OwnerResolver[] = [];

/** Called once per owning module at import time. */
export function registerFileOwner(resolver: OwnerResolver): void {
  resolvers.push(resolver);
}

export async function authorizeFileAccess(user: SessionUser, fileId: string): Promise<void> {
  for (const resolve of resolvers) {
    const verdict = await resolve(user, fileId);
    if (verdict === "allow") return;
    if (verdict === "deny") throw new ForbiddenError();
  }
  throw new ForbiddenError();
}
