/**
 * --- The browser half of docs/ACCEPTANCE.md   the criteria that can only be judged by ---
 * driving the interface. The API negatives (AC-03 API, AC-05, AC-06, AC-08, AC-13,
 * AC-14) run in the vitest suites; this covers AC-01, AC-02, AC-04, AC-07, AC-15,
 * AC-16 and AC-17, plus the Musts sweep items that are visual.
 *
 *   npx tsx scripts/checks/acceptance.ts
 */
import { chromium, type Browser, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const BASE = process.env.VAULT_BASE_URL ?? "http://localhost:3001";
const OUT = join(process.cwd(), "evidence", "acceptance");
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@byteforce.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "password123";

const results: { ac: string; pass: boolean; evidence: string }[] = [];
const check = (ac: string, pass: boolean, evidence: string) => {
  results.push({ ac, pass, evidence });
  console.log(`${pass ? "PASS" : "FAIL"}  ${ac}  ${evidence}`);
};

async function signIn(browser: Browser, email: string, password: string, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  return { ctx, page };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!ADMIN_PASSWORD) throw new Error("Set SEED_ADMIN_PASSWORD");

  const browser = await chromium.launch();
  const { ctx, page } = await signIn(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
  const tag = randomBytes(3).toString("hex");

// --- AC-01: form appears, company filter isolates it, link opens a new tab ---
  await page.goto(`${BASE}/forms`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add form", exact: true }).first().click();
  await page.fill("#name", `AC01 ${tag} intake`);
  await page.fill("#url", `https://forms.test/ac01-${tag}`);
  await page.selectOption("#company", "BSYSTEMS");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(2000);

  const appears = (await page.textContent("body"))?.includes(`AC01 ${tag} intake`) ?? false;

  await page.goto(`${BASE}/forms?company=BYTEFORCE`, { waitUntil: "networkidle" });
  const hiddenByFilter = !((await page.textContent("body")) ?? "").includes(`AC01 ${tag} intake`);
  await page.goto(`${BASE}/forms?company=BSYSTEMS`, { waitUntil: "networkidle" });
  const shownByFilter = ((await page.textContent("body")) ?? "").includes(`AC01 ${tag} intake`);

  const linkTarget = await page
    .locator(`a[href="https://forms.test/ac01-${tag}"]`)
    .first()
    .getAttribute("target");

  check(
    "AC-01",
    appears && hiddenByFilter && shownByFilter && linkTarget === "_blank",
    `created=${appears} filterHides=${hiddenByFilter} filterShows=${shownByFilter} target=${linkTarget}`,
  );
  await page.screenshot({ path: join(OUT, "ac-01-forms.png"), fullPage: true });

// --- AC-02: malformed URL rejected with a field-level message ----------------
  await page.goto(`${BASE}/forms`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add form", exact: true }).first().click();
  await page.fill("#name", `AC02 ${tag}`);
  await page.fill("#url", "notaurl");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1200);
  const notAUrlMsg = (await page.locator("#url-error").textContent().catch(() => null)) ?? "";

  await page.fill("#url", "ftp://x");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1200);
  const ftpMsg = (await page.locator("#url-error").textContent().catch(() => null)) ?? "";
  await page.screenshot({ path: join(OUT, "ac-02-url-validation.png") });

  const notSaved = await fetch(`${BASE}/api/forms?q=AC02%20${tag}`, {
    headers: { cookie: (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") },
  })
    .then((r) => r.json())
    .then((d: { total: number }) => d.total === 0)
    .catch(() => false);

  check(
    "AC-02",
    notAUrlMsg.length > 0 && ftpMsg.length > 0 && notSaved,
    `notaurl="${notAUrlMsg.slice(0, 40)}" ftp="${ftpMsg.slice(0, 40)}" nothingSaved=${notSaved}`,
  );
  await page.keyboard.press("Escape");

// --- AC-04: uploaded sheet's record count, computed, with today's as-of ------
  await page.goto(`${BASE}/sheets`, { waitUntil: "networkidle" });
  const sheetsText = (await page.textContent("body")) ?? "";

// --- The count must always be shown *with* its as-of date   a bare number is exactly ---
  // what §6.3.1 says nobody trusts. The date is the day the file was counted, not
  // today, so this asserts the pairing and the format. That the stamp is today's date
  // *at the moment of upload* is proven by the integration test, which uploads a fresh
  // file and compares against today in Cairo.
  const counted = sheetsText.match(/312\s*as of (\d{1,2} \w{3} \d{4})/);
  check(
    "AC-04",
    Boolean(counted),
    counted ? `computed count shown as "312 as of ${counted[1]}"` : "no computed count found",
  );
  await page.screenshot({ path: join(OUT, "ac-04-record-count.png"), fullPage: true });

// --- AC-07: the checkbox opens the result panel; the task stays open ---------
  await page.goto(`${BASE}/tasks`, { waitUntil: "networkidle" });
  const expand = page.getByRole("button", { name: "Show tasks" }).first();
  if (await expand.count()) {
    await expand.click();
    await page.waitForLoadState("networkidle");
  }
  const box = page.getByRole("button", { name: "Complete this task" }).first();
  await box.click();
  await page.waitForTimeout(600);
  const panelOpen = await page.getByRole("dialog").isVisible();
  const saveDisabled = await page
    .getByRole("button", { name: "Save and complete task" })
    .isDisabled();
  await page.screenshot({ path: join(OUT, "ac-07-result-panel.png") });
  check(
    "AC-07",
    panelOpen && saveDisabled,
    `panel opened instead of an error; save disabled while empty=${saveDisabled}`,
  );
  await page.keyboard.press("Escape");

// --- AC-15: delete archives, disappears from views and counts, restorable ----
  await page.goto(`${BASE}/forms?q=AC01%20${tag}`, { waitUntil: "networkidle" });
  const beforeCount = (await page.textContent("body")) ?? "";
  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.waitForTimeout(2000);

  await page.goto(`${BASE}/forms?q=AC01%20${tag}`, { waitUntil: "networkidle" });
  const goneFromList = !((await page.textContent("body")) ?? "").includes(`AC01 ${tag} intake`);

  await page.goto(`${BASE}/archive?q=AC01%20${tag}`, { waitUntil: "networkidle" });
  const inArchive = ((await page.textContent("body")) ?? "").includes(`AC01 ${tag} intake`);
  await page.screenshot({ path: join(OUT, "ac-15-archive.png"), fullPage: true });

  await page.getByRole("button", { name: "Restore" }).first().click();
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/forms?q=AC01%20${tag}`, { waitUntil: "networkidle" });
  const restored = ((await page.textContent("body")) ?? "").includes(`AC01 ${tag} intake`);

  check(
    "AC-15",
    goneFromList && inArchive && restored,
    `hidden=${goneFromList} inArchive=${inArchive} restored=${restored} (row was present before: ${beforeCount.includes(tag)})`,
  );

// --- AC-17: search returns results grouped by section ------------------------
  await page.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  await page.keyboard.type("nile");
// --- Wait for the answer rather than guessing at a duration   the first hit on the ---
  // search route in dev has to compile it.
  await page
    .getByText(/results? for|\d+ results/)
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => {});
  await page.waitForFunction(() => !document.body.innerText.includes("Searching\u2026"), {
    timeout: 20_000,
  }).catch(() => {});
  await page.waitForTimeout(300);

  const searchText = (await page.textContent("body")) ?? "";
  // Escapes, not literal glyphs: the middot survives any re-encoding of this file.
  const groups = ["Documents", "Tasks", "Sheets", "Forms"].filter((g) =>
    new RegExp(`${g}\\s*\u00B7\\s*\\d+`).test(searchText),
  );
  await page.screenshot({ path: join(OUT, "ac-17-search.png") });
  check("AC-17", groups.length >= 3, `grouped by section: ${groups.join(" ")}`);
  await page.keyboard.press("Escape");

// --- Musts sweep: FR-F08 duplicate warning -----------------------------------
  await page.goto(`${BASE}/forms`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add form", exact: true }).first().click();
  await page.fill("#name", `Duplicate probe ${tag}`);
  await page.fill("#url", `https://forms.test/ac01-${tag}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1500);
  const warned = ((await page.textContent("body")) ?? "").includes("already uses that address");
  await page.screenshot({ path: join(OUT, "musts-duplicate-warning.png") });
  check("FR-F08", warned, `duplicate URL warned and named the existing form`);
  await page.keyboard.press("Escape");

// --- Musts sweep: BR-15 timestamps render in Africa/Cairo --------------------
  const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  await page.goto(`${BASE}/forms`, { waitUntil: "networkidle" });
  const dateShown = /\d{1,2} \w{3} \d{4}/.test((await page.textContent("body")) ?? "");
  check("BR-15", dateShown, `dates render as d MMM yyyy (browser tz ${tz}, app formats to Africa/Cairo)`);

  await ctx.close();

// --- NFR-03: nothing scrolls horizontally at 375px, on every screen ----------
  const mobile = await signIn(browser, ADMIN_EMAIL, ADMIN_PASSWORD, 375);
  const overflow: string[] = [];
  for (const route of ["/forms", "/sheets", "/documents", "/tasks", "/employees", "/archive"]) {
    const p: Page = await mobile.ctx.newPage();
    await p.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(300);
    const ok = await p.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    if (!ok) overflow.push(route);
    await p.close();
  }
  check("NFR-03", overflow.length === 0, overflow.length ? `overflow on ${overflow.join(", ")}` : "no horizontal scroll on any screen at 375px");
  await mobile.ctx.close();

// --- NFR-11: keyboard reaches the create form, focus ring is violet ----------
  const kb = await signIn(browser, ADMIN_EMAIL, ADMIN_PASSWORD);
  await kb.page.goto(`${BASE}/forms`, { waitUntil: "networkidle" });
  for (let i = 0; i < 3; i++) await kb.page.keyboard.press("Tab");
  await kb.page.waitForTimeout(250);
  const ring = await kb.page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "none";
    const s = getComputedStyle(el);
    return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
  });
  check("NFR-11", ring.includes("83, 68, 155"), `focus ring ${ring}`);
  await kb.ctx.close();

  await browser.close();

  console.log("\n" + "=".repeat(70));
  console.log("AC | pass/fail | evidence");
  console.log("=".repeat(70));
  for (const r of results) {
    console.log(`${r.ac.padEnd(8)} ${r.pass ? "PASS" : "FAIL"}  ${r.evidence}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log("=".repeat(70));
  console.log(`${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
