import "server-only";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { UnprocessableError } from "@/lib/errors";
import { writeActivity } from "@/server/activity/log";
import { consumeInvitation, lookupInvitation } from "@/server/employees/invitations";

/**
 * Account activation and password reset (SPEC §5.2).
 *
 * Public sign-up is disabled in src/lib/auth.ts, so there is no sign-up endpoint to
 * call — the credential account is created here, directly, using the same Argon2id
 * hasher Better Auth is configured with (src/lib/password.ts). That keeps NFR-06 true
 * on both paths and leaves no open registration route.
 *
 * `providerId: "credential"` is what Better Auth's email/password provider looks up.
 */
const CREDENTIAL_PROVIDER = "credential";

/**
 * Consumes the token and either creates the account (ACTIVATION) or replaces the
 * password (PASSWORD_RESET), in one transaction. A second use of the same link fails
 * because `usedAt` is stamped inside that transaction.
 *
 * Returns the email so the caller can sign the person in.
 */
export async function setPasswordFromToken(
  rawToken: string,
  password: string,
): Promise<{ email: string }> {
  const found = await lookupInvitation(rawToken);
  if (!found.ok) {
    throw new UnprocessableError(
      "INVITATION_INVALID",
      "That link is no longer valid. Ask an admin to send a new one.",
    );
  }

  const employee = await db.employee.findUnique({
    where: { id: found.invitation.employeeId },
    select: { id: true, fullName: true, email: true, userId: true, isActive: true },
  });
  if (!employee) {
    throw new UnprocessableError("INVITATION_INVALID", "That link is no longer valid.");
  }
  if (!employee.isActive) {
    // A deactivated person must not be able to activate an account from an old link.
    throw new UnprocessableError(
      "INVITATION_INVALID",
      "That account is no longer active. Contact your admin.",
    );
  }

  const passwordHash = await hashPassword(password);

  await db.$transaction(async (tx) => {
    let userId = employee.userId;

    if (!userId) {
      const user = await tx.user.create({
        data: {
          name: employee.fullName,
          email: employee.email,
          emailVerified: true, // proven by receiving the emailed link
          role: "EMPLOYEE",
        },
      });
      userId = user.id;

      await tx.account.create({
        data: {
          accountId: user.id,
          providerId: CREDENTIAL_PROVIDER,
          userId: user.id,
          password: passwordHash,
        },
      });

      await tx.employee.update({ where: { id: employee.id }, data: { userId } });
    } else {
      const account = await tx.account.findFirst({
        where: { userId, providerId: CREDENTIAL_PROVIDER },
        select: { id: true },
      });
      if (account) {
        await tx.account.update({ where: { id: account.id }, data: { password: passwordHash } });
      } else {
        await tx.account.create({
          data: {
            accountId: userId,
            providerId: CREDENTIAL_PROVIDER,
            userId,
            password: passwordHash,
          },
        });
      }
      // Any live session belongs to whoever knew the old password.
      await tx.session.deleteMany({ where: { userId } });
    }

    await consumeInvitation(tx, found.invitation.id);

    await writeActivity(tx, {
      actorId: userId,
      entityType: "employee",
      entityId: employee.id,
      action: "activate",
      meta: { purpose: found.invitation.purpose },
    });
  });

  return { email: employee.email };
}

export { lookupInvitation };
