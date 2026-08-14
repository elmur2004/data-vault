import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { InvitationPurpose, Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { invitationEmail, sendMail } from "@/lib/mail";

/**
 * Invitation and password-reset links (SPEC §5.2, BR-12).
 *
 * The raw token exists in exactly one place: the emailed URL. Only its SHA-256 hash
 * is stored, so a database read cannot be turned into account access. Single use,
 * seven-day expiry, and re-inviting revokes whatever came before.
 */

export const INVITATION_DAYS = 7;

type Client = PrismaClient | Prisma.TransactionClient;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issues a token, revoking any live one for this employee and purpose so a previously
 * emailed link stops working the moment a new one is sent.
 *
 * Returns the raw token — the caller emails it and must not persist or log it.
 */
export async function issueInvitation(
  tx: Client,
  employeeId: string,
  purpose: InvitationPurpose = "ACTIVATION",
): Promise<{ raw: string; expiresAt: Date }> {
  await tx.invitation.updateMany({
    where: { employeeId, purpose, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const raw = randomBytes(32).toString("base64url"); // 256 bits
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);

  await tx.invitation.create({
    data: { employeeId, tokenHash: hashToken(raw), expiresAt, purpose },
  });

  return { raw, expiresAt };
}

export type InvitationLookup =
  | { ok: true; invitation: { id: string; employeeId: string; purpose: InvitationPurpose } }
  | { ok: false; reason: "unknown" | "used" | "revoked" | "expired" };

/**
 * Resolves a raw token. Deliberately distinguishes used/expired/unknown so the
 * activation screen can say something useful — these are not secrets, and "your link
 * expired, ask your admin to re-invite" beats a blank failure.
 */
export async function lookupInvitation(raw: string): Promise<InvitationLookup> {
  if (!raw) return { ok: false, reason: "unknown" };

  const candidate = hashToken(raw);
  const row = await db.invitation.findUnique({
    where: { tokenHash: candidate },
    select: {
      id: true,
      employeeId: true,
      purpose: true,
      tokenHash: true,
      usedAt: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!row) return { ok: false, reason: "unknown" };

  // The lookup above is already a hash match; this keeps the comparison constant-time
  // in case the lookup is ever changed to something coarser.
  const a = Buffer.from(row.tokenHash, "hex");
  const b = Buffer.from(candidate, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "unknown" };

  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    invitation: { id: row.id, employeeId: row.employeeId, purpose: row.purpose },
  };
}

/** Marks single-use. Must run inside the same transaction that creates the account. */
export async function consumeInvitation(tx: Client, invitationId: string): Promise<void> {
  await tx.invitation.update({
    where: { id: invitationId },
    data: { usedAt: new Date() },
  });
}

export function activationUrl(raw: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3001";
  return `${base}/activate/${raw}`;
}

/** Sends the link. Failure is reported, never thrown — see src/lib/mail.ts. */
export async function sendInvitation(opts: {
  to: string;
  fullName: string;
  raw: string;
  purpose: InvitationPurpose;
}) {
  const body = invitationEmail({
    fullName: opts.fullName,
    url: activationUrl(opts.raw),
    days: INVITATION_DAYS,
    purpose: opts.purpose,
  });
  return sendMail({ to: opts.to, ...body });
}
