/**
 * Seed — DF-01: how the first admin comes to exist.
 *
 * SPEC §5.2 covers admin-created employees, but nothing says how the admin themselves
 * appears, and there is no public sign-up (S-03). So: this script creates exactly one
 * admin and prints the generated password **once, to the console**. It is never
 * written to the repo, never stored readable, and never derived from a pattern
 * (BR-12). Losing it means re-running with --reset-admin.
 *
 *   npm run db:seed
 *   npm run db:seed -- --reset-admin                  # re-issue a random password
 *   npm run db:seed -- --reset-admin --password=xyz   # set a chosen one (dev)
 *   npm run db:seed -- --demo                         # also add sample employees
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/password";

const db = new PrismaClient();

const RESET = process.argv.includes("--reset-admin");
const DEMO = process.argv.includes("--demo");
const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? "admin@byteforce.local").toLowerCase();

/**
 * A chosen password, for a local instance somebody has to sign into repeatedly.
 *
 * Still hashed with Argon2id and still never stored readable, so BR-12's substance
 * holds; what it gives up is the entropy of the generated default, which is why the
 * script says so out loud when it is used. The app's own minimum length is enforced
 * here too, so this path cannot set something the sign-in form would have rejected.
 */
const CHOSEN = (() => {
  const arg = process.argv.find((a) => a.startsWith("--password="));
  if (!arg) return null;
  const value = arg.slice("--password=".length);
  if (value.length < MIN_PASSWORD_LENGTH) {
    console.error(`--password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }
  return value;
})();

/** Random, not patterned (BR-12). 24 bytes of base64url ≈ 192 bits. */
function generatePassword() {
  return randomBytes(24).toString("base64url");
}

async function upsertAdmin() {
  const existing = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing && !RESET) {
    console.log(`Admin already exists: ${ADMIN_EMAIL}`);
    console.log("Re-issue its password with:  npm run db:seed -- --reset-admin");
    return;
  }

  const password = CHOSEN ?? generatePassword();
  const passwordHash = await hashPassword(password);

  const user = existing
    ? await db.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN", name: "Vault admin", emailVerified: true },
      })
    : await db.user.create({
        data: {
          name: "Vault admin",
          email: ADMIN_EMAIL,
          emailVerified: true,
          role: "ADMIN",
        },
      });

  const account = await db.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (account) {
    await db.account.update({ where: { id: account.id }, data: { password: passwordHash } });
    // Any existing session belongs to whoever knew the old password.
    await db.session.deleteMany({ where: { userId: user.id } });
  } else {
    await db.account.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: passwordHash,
      },
    });
  }

  console.log("");
  console.log("=".repeat(64));
  console.log(existing ? "  ADMIN PASSWORD RESET" : "  ADMIN CREATED");
  console.log("=".repeat(64));
  console.log(`  email     ${ADMIN_EMAIL}`);
  console.log(`  password  ${password}`);
  console.log("=".repeat(64));
  if (CHOSEN) {
    console.log("  Chosen password. Hashed with Argon2id, never stored readable —");
    console.log("  but far weaker than the generated default. Local instances only.");
  } else {
    console.log("  Shown once. Not stored anywhere readable. Copy it now.");
  }
  console.log("");
}

async function demoEmployees() {
  const people = [
    { fullName: "Nour Hassan", email: "nour@byteforce.local", jobTitle: "Account manager", company: "BYTEFORCE" as const },
    { fullName: "Omar Fathy", email: "omar@bsystems.local", jobTitle: "Systems engineer", company: "BSYSTEMS" as const },
    { fullName: "Salma Adel", email: "salma@byteforce.local", jobTitle: "Operations lead", company: null },
  ];

  for (const p of people) {
    const existing = await db.employee.findUnique({ where: { email: p.email } });
    if (existing) continue;
    await db.employee.create({ data: p });
    console.log(`  employee: ${p.fullName} <${p.email}>`);
  }
  console.log("  (no invitations sent — use “Resend invitation” in the UI)");
}

async function main() {
  await upsertAdmin();
  if (DEMO) {
    console.log("Demo employees:");
    await demoEmployees();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
