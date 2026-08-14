/**
 * Signed-in screenshots of every screen, desktop and 375px.
 *   npx tsx scripts/checks/shots-app.ts <milestone>
 *
 * Signs in as the admin (and separately as the demo employee) using credentials from
 * the environment, so evidence reflects what each role actually sees.
 */
import { chromium, type Browser, type BrowserContext } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.VAULT_BASE_URL ?? "http://localhost:3001";
const OUT = join(process.cwd(), "evidence", process.argv[2] ?? "ui");

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@byteforce.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const EMP_EMAIL = "hana.demo@byteforce.local";
const EMP_PASSWORD = "employee-demo-pass";

const consoleErrors: string[] = [];

async function signIn(browser: Browser, email: string, password: string, width: number, height: number) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`[${width}px] ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`[${width}px] pageerror: ${e.message.slice(0, 200)}`));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  return { ctx, page };
}

async function shoot(ctx: BrowserContext, route: string, name: string, full = true) {
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  console.log(`${res?.status() ?? "?"}  ${route}  ->  ${name}.png`);
  await page.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!ADMIN_PASSWORD) {
    console.error("Set SEED_ADMIN_PASSWORD.");
    process.exit(1);
  }

  const browser = await chromium.launch();

  // ── Admin, desktop ──
  const admin = await signIn(browser, ADMIN_EMAIL, ADMIN_PASSWORD, 1280, 900);
  for (const [route, name] of [
    ["/forms", "forms-desktop"],
    ["/sheets", "sheets-desktop"],
    ["/documents", "documents-desktop"],
    ["/tasks", "tasks-desktop"],
    ["/employees", "employees-desktop"],
    ["/archive", "archive-desktop"],
    ["/overdue", "overdue-desktop"],
  ] as const) {
    await shoot(admin.ctx, route, name);
  }

  // Tasks with a card expanded — the screen the design leads with.
  const expand = await admin.ctx.newPage();
  await expand.goto(`${BASE}/tasks`, { waitUntil: "networkidle" });
  const firstExpand = expand.getByRole("button", { name: "Show tasks" }).first();
  if (await firstExpand.count()) {
    await firstExpand.click();
    await expand.waitForLoadState("networkidle");
    await expand.waitForTimeout(500);
  }
  await expand.screenshot({ path: join(OUT, "tasks-expanded-desktop.png"), fullPage: true });

  // The result panel, opened from the checkbox (FR-T06/AC-07).
  const checkbox = expand.getByRole("button", { name: "Complete this task" }).first();
  if (await checkbox.count()) {
    await checkbox.click();
    await expand.waitForTimeout(500);
    await expand.screenshot({ path: join(OUT, "result-panel-desktop.png") });
  }
  await expand.close();

  // Global search (AC-17).
  const search = await admin.ctx.newPage();
  await search.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
  await search.keyboard.press("Control+k");
  await search.waitForTimeout(300);
  await search.keyboard.type("nile");
  await search.waitForTimeout(900);
  await search.screenshot({ path: join(OUT, "search-desktop.png") });
  await search.close();

  await admin.ctx.close();

  // ── Admin, 375px ──
  const mobile = await signIn(browser, ADMIN_EMAIL, ADMIN_PASSWORD, 375, 812);
  for (const [route, name] of [
    ["/forms", "forms-mobile"],
    ["/sheets", "sheets-mobile"],
    ["/tasks", "tasks-mobile"],
  ] as const) {
    await shoot(mobile.ctx, route, name);
  }
  // Drawer open
  const drawer = await mobile.ctx.newPage();
  await drawer.goto(`${BASE}/forms`, { waitUntil: "networkidle" });
  await drawer.getByRole("button", { name: "Open menu" }).click();
  await drawer.waitForTimeout(300);
  await drawer.screenshot({ path: join(OUT, "drawer-mobile.png") });
  await drawer.close();
  await mobile.ctx.close();

  // ── Employee view — one card, no other names (AC-13) ──
  const emp = await signIn(browser, EMP_EMAIL, EMP_PASSWORD, 1280, 900);
  if (!emp.page.url().includes("/login")) {
    await shoot(emp.ctx, "/tasks", "tasks-employee-desktop");
    await shoot(emp.ctx, "/forms", "forms-employee-desktop");
  } else {
    console.log("employee sign-in failed — run `npm run db:demo`");
  }
  await emp.ctx.close();

  const empMobile = await signIn(browser, EMP_EMAIL, EMP_PASSWORD, 375, 812);
  if (!empMobile.page.url().includes("/login")) {
    await shoot(empMobile.ctx, "/tasks", "tasks-employee-mobile");
  }
  await empMobile.ctx.close();

  await browser.close();

  if (consoleErrors.length) {
    console.log("\nCONSOLE ERRORS:");
    for (const e of [...new Set(consoleErrors)]) console.log("  " + e);
    process.exitCode = 1;
  } else {
    console.log("\nNo console errors.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
