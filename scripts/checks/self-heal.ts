/**
 * Proves the self-healing actually heals, rather than trusting that it does.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/checks/self-heal.ts
 *
 * It breaks the environment on purpose - stops services, renames the admin, corrupts
 * its password - runs `npm run doctor`, and checks that everything came back. It also
 * asserts the two things that must NOT happen: Postgres is never restarted, and no
 * data is lost.
 */
import { execFileSync } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const ADMIN_EMAIL = "admin@byteforce.com";
const ADMIN_PASSWORD = "password123";

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection({ port, host: "127.0.0.1" });
    const done = (v: boolean) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(800);
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
  });
}

function doctor() {
  return execFileSync("npm", ["run", "doctor"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32",
  });
}

async function main() {
  const db = new PrismaClient();

  // What must survive the heal untouched.
  const before = {
    forms: await db.form.count(),
    tasks: await db.task.count(),
    employees: await db.employee.count(),
    activity: await db.activityLog.count(),
    completed: await db.task.count({ where: { status: "COMPLETED" } }),
  };
  const pgPidBefore = (
    await db.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`
  )[0]?.pid;
  const pgStartBefore = (
    await db.$queryRaw<{ started: Date }[]>`SELECT pg_postmaster_start_time() AS started`
  )[0]?.started;

// --- break it ----------------------------------------------------------------
  console.log("breaking the environment on purpose...\n");

  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("no admin to break - run npm run doctor first");

  await db.user.update({
    where: { id: admin.id },
    data: { email: "broken-admin@nowhere.invalid" },
  });
  await db.account.updateMany({
    where: { userId: admin.id, providerId: "credential" },
    data: {
      password:
        "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    },
  });

  // Stop what can be safely stopped. Postgres stays up on purpose: healing must
  // never require a database restart.
  for (const name of ["mailpit"]) {
    try {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-Process ${name} -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*${ROOT.replace(/\\/g, "\\")}*' } | Stop-Process -Force`,
        ],
        { stdio: "pipe" },
      );
    } catch {
      /* not running is fine */
    }
  }
  await new Promise((r) => setTimeout(r, 1500));

  const mailpitDown = !(await portOpen(1025));
  console.log(`  mailpit down: ${mailpitDown}\n`);

  await db.$disconnect();

// --- heal --------------------------------------------------------------------
  console.log("running the doctor...\n");
  const output = doctor();
  console.log(
    output
      .split("\n")
      .filter((l) => l.includes("[") || l.includes("Fixed") || l.includes("healthy"))
      .join("\n"),
  );
  console.log("");

// --- verify ------------------------------------------------------------------
  const db2 = new PrismaClient();

  check("mailpit is back", await portOpen(1025));
  // Files are on local disk now, so the storage directory is what must survive.
  check(
    "file storage is present",
    existsSync(resolve(ROOT, process.env.STORAGE_DIR ?? "storage")),
    resolve(ROOT, process.env.STORAGE_DIR ?? "storage"),
  );

  const healedAdmin = await db2.user.findUnique({ where: { email: ADMIN_EMAIL } });
  check("admin email restored", Boolean(healedAdmin), ADMIN_EMAIL);
  check("admin kept its identity (history intact)", healedAdmin?.id === admin.id, healedAdmin?.id);

  const account = healedAdmin
    ? await db2.account.findFirst({
        where: { userId: healedAdmin.id, providerId: "credential" },
      })
    : null;
  const { verifyPassword } = await import("../../src/lib/password");
  const passwordWorks = account?.password
    ? await verifyPassword(account.password, ADMIN_PASSWORD)
    : false;
  check("admin password is the expected one", passwordWorks);
  check(
    "password is still Argon2id",
    Boolean(account?.password?.startsWith("$argon2id$")),
    account?.password?.slice(0, 24),
  );

  // The two things that must NOT happen.
  const pgStartAfter = (
    await db2.$queryRaw<{ started: Date }[]>`SELECT pg_postmaster_start_time() AS started`
  )[0]?.started;
  check(
    "Postgres was never restarted",
    pgStartBefore?.getTime() === pgStartAfter?.getTime(),
    `up since ${pgStartAfter?.toISOString()}`,
  );

  const after = {
    forms: await db2.form.count(),
    tasks: await db2.task.count(),
    employees: await db2.employee.count(),
    activity: await db2.activityLog.count(),
    completed: await db2.task.count({ where: { status: "COMPLETED" } }),
  };
  check(
    "no data was lost",
    after.forms >= before.forms &&
      after.tasks >= before.tasks &&
      after.employees >= before.employees &&
      after.activity >= before.activity &&
      after.completed >= before.completed,
    `forms ${before.forms} -> ${after.forms}, tasks ${before.tasks} -> ${after.tasks}, activity ${before.activity} -> ${after.activity}`,
  );

  // Running it again must change nothing.
  const second = doctor();
  check(
    "second run is a no-op",
    /Everything was already healthy/.test(second),
    "idempotent",
  );

  await db2.$disconnect();
  void pgPidBefore;

  const failed = results.filter((r) => !r.pass).length;
  console.log("-".repeat(62));
  console.log(`${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
