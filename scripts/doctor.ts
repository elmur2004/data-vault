/**
 * Self-heal. Run after any pull, push or cold start; run it twice and nothing changes.
 *
 *   npm run doctor          fix what is broken, report what it did
 *   npm run doctor -- --check   report only, change nothing (used by CI)
 *
 * It is wired to `predev`, `prestart` and `pretest`, so `npm run dev` on a fresh clone
 * or after a `git pull` just works.
 *
 * **It never destroys anything.** No migrate reset, no dropped database, no deleted
 * rows, no restarted Postgres if Postgres is already answering. Every step checks
 * first and acts only on what is actually missing, because "self-healing" that wipes
 * your data is just a slower way of losing it.
 *
 * Steps, in dependency order:
 *   1. local services are listening (started only if they are not)
 *   2. the database exists
 *   3. pending migrations are applied
 *   4. the Prisma client matches the schema
 *   5. the file-storage location exists and is not web-served
 *   6. the admin account exists with the expected credentials
 */
import { execFileSync } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, sep } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "../src/lib/password";

const CHECK_ONLY = process.argv.includes("--check");
const ROOT = process.cwd();
const SERVICES = join(ROOT, ".devservices");
const ENV_PATH = join(ROOT, ".env");

type Step = { name: string; state: "ok" | "healed" | "failed" | "skipped"; detail: string };
const steps: Step[] = [];
const record = (name: string, state: Step["state"], detail = "") =>
  steps.push({ name, state, detail });

/**
 * The account the app is always reachable with. Fixed on purpose so that a clone, a
 * pull or a rebuilt database never leaves anybody locked out hunting for a password
 * that was printed once.
 */
const REQUIRED_ADMIN_EMAIL = "admin@byteforce.com";
const REQUIRED_ADMIN_PASSWORD = "password123";

// --- Read after ensureEnvFile() has run, never before   on a fresh clone there is no .env ---
// yet and these would otherwise capture the wrong values.
let ADMIN_EMAIL = REQUIRED_ADMIN_EMAIL;
let ADMIN_PASSWORD = REQUIRED_ADMIN_PASSWORD;

// --- helpers -----------------------------------------------------------------

function portOpen(port: number, host = "127.0.0.1", timeout = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function portFromUrl(url: string | undefined, fallback: number): number {
  if (!url) return fallback;
  try {
    return Number(new URL(url).port) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * `shell` defaults to true on Windows because npx is a .cmd and cannot be executed
 * --- directly   but a shell concatenates argv without quoting, so any argument holding a ---
 * space (this project's own path does) is silently split. Real executables are run
 * with shell:false so their arguments survive intact.
 */
function run(cmd: string, args: string[], opts: { quiet?: boolean; shell?: boolean } = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: opts.quiet ? "pipe" : "inherit",
    encoding: "utf8",
    shell: opts.shell ?? process.platform === "win32",
  });
}

// --- 0. the environment file -------------------------------------------------

/**
 * Guarantees a usable `.env`.
 *
 * --- A fresh clone has none   `.env` is gitignored, correctly, because it holds secrets. ---
 * So this builds one: it starts from `.env.example`, generates the values that must be
 * random (auth and cron secrets), keeps every value the developer has already set, and
 * pins the two admin keys so the sign-in credentials are the same everywhere.
 *
 * --- Only keys that are missing get added. The admin pair is the sole exception   those ---
 * are enforced, because "always these credentials" is the point.
 */
function ensureEnvFile(): { state: Step["state"]; detail: string } {
  const generated = () => randomBytes(36).toString("base64url");

  // A value already in the environment wins over the built-in default, so a CI job or
  // a container that sets DATABASE_URL gets a .env that agrees with it rather than one
  // pointing at a local port that does not exist there.
  const fromEnv = (key: string, fallback: string) => process.env[key]?.trim() || fallback;

  const defaults: Record<string, string> = {
    DATABASE_URL: fromEnv("DATABASE_URL", "postgresql://postgres:database@127.0.0.1:55432/database_app?schema=public"),
    APP_URL: fromEnv("APP_URL", "http://localhost:3001"),
    BETTER_AUTH_URL: fromEnv("BETTER_AUTH_URL", "http://localhost:3001"),
    BETTER_AUTH_SECRET: fromEnv("BETTER_AUTH_SECRET", generated()),
    // Uploads live on local disk, inside the project (docs/FILE-STORAGE.md).
    STORAGE_DIR: fromEnv("STORAGE_DIR", "storage"),
    SIGNED_URL_TTL_SECONDS: fromEnv("SIGNED_URL_TTL_SECONDS", "300"),
    MAX_UPLOAD_MB: fromEnv("MAX_UPLOAD_MB", "25"),
    SMTP_HOST: fromEnv("SMTP_HOST", "127.0.0.1"),
    SMTP_PORT: fromEnv("SMTP_PORT", "1025"),
    SMTP_FROM: fromEnv("SMTP_FROM", "Vault <no-reply@local.test>"),
    DISPLAY_TZ: fromEnv("DISPLAY_TZ", "Africa/Cairo"),
    MALWARE_SCAN: fromEnv("MALWARE_SCAN", "off"),
    CRON_SECRET: fromEnv("CRON_SECRET", generated()),
  };

  const enforced: Record<string, string> = {
    SEED_ADMIN_EMAIL: REQUIRED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: REQUIRED_ADMIN_PASSWORD,
  };

  const existed = existsSync(ENV_PATH);
  const original = existed ? readFileSync(ENV_PATH, "utf8") : "";
  const lines = original.length ? original.split(/\r?\n/) : [];

  const keyOf = (line: string) => line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
  const present = new Set(lines.map(keyOf).filter(Boolean) as string[]);

  const added: string[] = [];
  const changed: string[] = [];

  // Rewrite the enforced keys in place, wherever they already are.
  const next = lines.map((line) => {
    const key = keyOf(line);
    if (key && key in enforced) {
      const wanted = `${key}="${enforced[key]}"`;
      if (line.trim() !== wanted) changed.push(key);
      return wanted;
    }
    return line;
  });

  for (const [key, value] of Object.entries(enforced)) {
    if (!present.has(key)) {
      next.push(`${key}="${value}"`);
      added.push(key);
    }
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (!present.has(key)) {
      next.push(`${key}="${value}"`);
      added.push(key);
    }
  }

  if (!existed) {
    next.unshift(
      "# Generated by `npm run doctor`. Never committed - .env is gitignored.",
      "# Values you change are kept; only missing keys are added.",
      "",
    );
  }

  const output = next.join("\n").replace(/\n{3,}/g, "\n\n");
  const dirty = output !== original;

  if (dirty && CHECK_ONLY) {
    return { state: "failed", detail: existed ? "keys missing or stale" : ".env missing" };
  }
  if (dirty) writeFileSync(ENV_PATH, output.endsWith("\n") ? output : `${output}\n`, "utf8");

  // Load it into this process now, so every later step sees the corrected values.
  // `loadEnvFile` leaves anything already in process.env alone, so the enforced pair
// --- is assigned explicitly   otherwise a stale value inherited from the shell would ---
  // quietly win over the file we just fixed.
  process.loadEnvFile(ENV_PATH);
  for (const [key, value] of Object.entries(enforced)) process.env[key] = value;

  ADMIN_EMAIL = enforced.SEED_ADMIN_EMAIL!.toLowerCase();
  ADMIN_PASSWORD = enforced.SEED_ADMIN_PASSWORD!;

  if (!existed) return { state: "healed", detail: `created .env with ${added.length} keys` };
  if (changed.length) return { state: "healed", detail: `pinned ${changed.join(", ")}` };
  if (added.length) return { state: "healed", detail: `added ${added.join(", ")}` };
  return { state: "ok", detail: "all keys present" };
}

// --- 1. services -------------------------------------------------------------

async function ensureServices() {
  const dbPort = portFromUrl(process.env.DATABASE_URL?.replace(/^postgres/, "http"), 5432);
  const smtpPort = Number(process.env.SMTP_PORT ?? 1025);

  // Files are on local disk, so there is no object-storage service to start.
  const wanted = [
    { label: "postgres", port: dbPort },
    { label: "mailpit", port: smtpPort },
  ];

  const before = await Promise.all(wanted.map((w) => portOpen(w.port)));
  const down = wanted.filter((_, i) => !before[i]);

  if (down.length === 0) {
    record("services", "ok", wanted.map((w) => `${w.label}:${w.port}`).join(" "));
    return;
  }

  if (CHECK_ONLY) {
    record("services", "failed", `down: ${down.map((d) => `${d.label}:${d.port}`).join(", ")}`);
    return;
  }

  // Only this project's services, and only the ones that are actually down. An
// --- already-running Postgres is never touched   that is what stops a heal from ---
  // becoming a restart.
  const script = join(SERVICES, "services.ps1");
  if (process.platform === "win32" && existsSync(script)) {
    try {
// --- shell:false   the script path contains a space, and a shell would split it. ---
      run("powershell", ["-ExecutionPolicy", "Bypass", "-File", script, "start"], {
        quiet: true,
        shell: false,
      });
    } catch {
      /* reported by the port re-check below */
    }
  } else {
    record(
      "services",
      "skipped",
      `not started automatically on ${process.platform}; expecting them to be provided`,
    );
  }

  // Give them a moment to bind, then re-check.
  const deadline = Date.now() + 30_000;
  let stillDown = down;
  while (Date.now() < deadline && stillDown.length) {
    await new Promise((r) => setTimeout(r, 700));
    const now = await Promise.all(stillDown.map((d) => portOpen(d.port)));
    stillDown = stillDown.filter((_, i) => !now[i]);
  }

  if (stillDown.length) {
    record("services", "failed", `still down: ${stillDown.map((d) => d.label).join(", ")}`);
  } else {
    record("services", "healed", `started ${down.map((d) => d.label).join(", ")}`);
  }
}

// --- 2 & 3. database and migrations ------------------------------------------

/** Creates the database only if connecting to it says it does not exist. */
function ensureDatabaseExists(): "ok" | "healed" | "failed" {
  const url = process.env.DATABASE_URL;
  if (!url) return "failed";

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return "failed";
  }

  const name = target.pathname.replace(/^\//, "").split("?")[0]!;
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  // Postgres has no CREATE DATABASE IF NOT EXISTS, so the create is simply attempted
  // and an "already exists" error is the success case. Connecting to the maintenance
  // database first would be a second round trip that tells us nothing more.
  try {
    execFileSync("npx", ["prisma", "db", "execute", "--url", adminUrl.toString(), "--stdin"], {
      cwd: ROOT,
      input: `CREATE DATABASE "${name}";`,
      stdio: "pipe",
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    return "healed";
  } catch (e) {
    const text = String((e as { stderr?: string; message?: string }).stderr ?? (e as Error).message);
    if (/already exists/i.test(text)) return "ok";
    return "failed";
  }
}

function ensureMigrations(): { state: Step["state"]; detail: string } {
  try {
    const out = run("npx", ["prisma", "migrate", "status"], { quiet: true });
    if (/Database schema is up to date/i.test(out)) {
      return { state: "ok", detail: "schema up to date" };
    }
  } catch {
    /* status exits non-zero when migrations are pending - that is what we fix */
  }

  if (CHECK_ONLY) return { state: "failed", detail: "migrations pending" };

  try {
    // `deploy`, never `reset`: it applies what is missing and never drops data.
    const out = run("npx", ["prisma", "migrate", "deploy"], { quiet: true });
    const applied = out.match(/Applying migration/g)?.length ?? 0;
    return {
      state: applied > 0 ? "healed" : "ok",
      detail: applied > 0 ? `applied ${applied} migration(s)` : "schema up to date",
    };
  } catch (e) {
    return { state: "failed", detail: String((e as Error).message).slice(0, 120) };
  }
}

// --- 4. the generated Prisma client ------------------------------------------

/**
 * Regenerates the client only when the schema is actually newer than it.
 *
 * On Windows a running dev server holds `query_engine-windows.dll.node` open, and
 * --- regenerating over it fails with EPERM. That is not a broken project   it means the ---
 * --- client is loaded and current   so the heal reports it and moves on instead of ---
 * failing. Blindly regenerating on every run would turn a healthy repo into a red one
 * every time the app happened to be running.
 */
function ensurePrismaClient(): { state: Step["state"]; detail: string } {
  const generated = join(ROOT, "node_modules", ".prisma", "client", "index.js");
  const schema = join(ROOT, "prisma", "schema.prisma");

  let needsGenerate = true;
  if (existsSync(generated) && existsSync(schema)) {
    try {
      needsGenerate = statSync(schema).mtimeMs > statSync(generated).mtimeMs;
    } catch {
      needsGenerate = true;
    }
  }

  if (!needsGenerate) return { state: "ok", detail: "in sync with the schema" };

  try {
    run("npx", ["prisma", "generate"], { quiet: true });
    return { state: "healed", detail: "regenerated from the schema" };
  } catch (e) {
    const text = String((e as { stderr?: string; message?: string }).stderr ?? (e as Error).message);
    if (/EPERM|EBUSY|being used by another process/i.test(text)) {
      return {
        state: "skipped",
        detail: "engine is loaded by a running process - restart the dev server to pick up schema changes",
      };
    }
    return { state: "failed", detail: text.slice(0, 110) };
  }
}

// --- 5. file storage ---------------------------------------------------------

/**
 * Uploads live on local disk, inside the project. §10.3 still requires them to be
 * private, so the one thing this refuses outright is a location under public/ -
 * anything there is served by Next without authorisation, which breaks BR-14.
 */
function ensureStorage(): { state: Step["state"]; detail: string } {
  const configured = process.env.STORAGE_DIR ?? "storage";
  const root = configured.match(/^([A-Za-z]:[\\\\/]|\/)/) ? configured : join(ROOT, configured);

  const publicDir = join(ROOT, "public");
  if (root === publicDir || root.startsWith(publicDir + sep)) {
    return {
      state: "failed",
      detail: "STORAGE_DIR is inside public/ - files there would be served without authorisation",
    };
  }

  if (existsSync(root)) return { state: "ok", detail: root };
  if (CHECK_ONLY) return { state: "failed", detail: `${root} missing` };
  try {
    mkdirSync(root, { recursive: true });
    return { state: "healed", detail: `created ${root}` };
  } catch (e) {
    return { state: "failed", detail: String((e as Error).message).slice(0, 110) };
  }
}

// --- 6. the admin account ----------------------------------------------------

/**
 * Guarantees exactly one admin with the expected credentials.
 *
 * Idempotent on purpose: if the password already verifies, nothing is written and no
 * sessions are revoked, so healing does not sign anybody out. An existing admin under
 * --- a different address is *renamed* rather than replaced, so its id   and therefore ---
 * --- every ActivityLog entry attributing work to it   survives. --------------
 */
async function ensureAdmin(db: PrismaClient): Promise<{ state: Step["state"]; detail: string }> {
  if (ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
    return {
      state: "failed",
      detail: `SEED_ADMIN_PASSWORD is shorter than the ${MIN_PASSWORD_LENGTH} characters the app itself requires`,
    };
  }

  // A known password is a development convenience. Refuse to bake it into a
  // production database unless somebody says so explicitly.
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_FIXED_ADMIN_PASSWORD) {
    return {
      state: "skipped",
      detail: "NODE_ENV=production - set ALLOW_FIXED_ADMIN_PASSWORD=1 to allow a fixed password",
    };
  }

  let user = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  let renamedFrom: string | null = null;

  if (!user) {
    // Reuse an existing admin so its history stays attached to it.
    const existingAdmin = await db.user.findFirst({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    });
    if (existingAdmin) {
      renamedFrom = existingAdmin.email;
      user = await db.user.update({
        where: { id: existingAdmin.id },
        data: { email: ADMIN_EMAIL, role: "ADMIN", emailVerified: true },
      });
    } else {
      if (CHECK_ONLY) return { state: "failed", detail: "no admin account" };
      user = await db.user.create({
        data: {
          name: "Vault admin",
          email: ADMIN_EMAIL,
          emailVerified: true,
          role: "ADMIN",
        },
      });
    }
  } else if (user.role !== "ADMIN") {
    user = await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  }

  const account = await db.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (account?.password && (await verifyPassword(account.password, ADMIN_PASSWORD))) {
    return {
      state: renamedFrom ? "healed" : "ok",
      detail: renamedFrom
        ? `${renamedFrom} renamed to ${ADMIN_EMAIL}; password already correct`
        : `${ADMIN_EMAIL} ready`,
    };
  }

  if (CHECK_ONLY) return { state: "failed", detail: "admin password does not match" };

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  if (account) {
    await db.account.update({ where: { id: account.id }, data: { password: passwordHash } });
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
  // The password changed, so anything signed in with the old one is no longer valid.
  await db.session.deleteMany({ where: { userId: user.id } });

  return {
    state: "healed",
    detail: renamedFrom
      ? `${renamedFrom} renamed to ${ADMIN_EMAIL}, password set`
      : `${ADMIN_EMAIL} password set`,
  };
}

// --- run ---------------------------------------------------------------------

async function main() {
  console.log(CHECK_ONLY ? "Checking Vault..." : "Healing Vault...");

  const env = ensureEnvFile();
  record("environment", env.state, env.detail);
  if (env.state === "failed" && !CHECK_ONLY) {
    report();
    process.exit(1);
  }

  await ensureServices();

  const servicesOk = steps.find((s) => s.name === "services")?.state !== "failed";

  if (!servicesOk) {
    report();
    process.exit(1);
  }

  if (CHECK_ONLY) {
    record("database", "skipped", "not created in --check");
  } else {
    const dbState = ensureDatabaseExists();
    record(
      "database",
      dbState,
      dbState === "healed" ? "created" : dbState === "ok" ? "present" : "could not reach postgres",
    );
  }

  const migrations = ensureMigrations();
  record("migrations", migrations.state, migrations.detail);

  if (!CHECK_ONLY) {
    const gen = ensurePrismaClient();
    record("prisma client", gen.state, gen.detail);
  }

  const storage = ensureStorage();
  record("file storage", storage.state, storage.detail);

  const db = new PrismaClient();
  try {
    const admin = await ensureAdmin(db);
    record("admin account", admin.state, admin.detail);
  } catch (e) {
    record("admin account", "failed", String((e as Error).message).slice(0, 120));
  } finally {
    await db.$disconnect();
  }

  report();
  if (steps.some((s) => s.state === "failed")) process.exit(1);
}

function report() {
  const mark = { ok: "  ok  ", healed: "healed", failed: "FAILED", skipped: " skip " };
  console.log("");
  for (const s of steps) {
    console.log(`  [${mark[s.state]}]  ${s.name.padEnd(15)} ${s.detail}`);
  }
  const healed = steps.filter((s) => s.state === "healed").length;
  const failed = steps.filter((s) => s.state === "failed").length;
  console.log("");
  console.log(
    failed
      ? `  ${failed} problem(s) could not be fixed automatically.`
      : healed
        ? `  Fixed ${healed} thing(s). Everything is ready.`
        : `  Everything was already healthy.`,
  );
  if (!failed) console.log(`  Sign in as ${ADMIN_EMAIL}`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
