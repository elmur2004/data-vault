/**
 * NFR-01 / NFR-02 — measured, not assumed.
 *
 *   NFR-01  any table loads in under 1.5 s at 2,000 rows
 *   NFR-02  search returns in under 1 second
 *
 * Run against the production build (`npm run build && npm run start`), because dev
 * compiles on demand and would measure the bundler, not the app.
 */
import { chromium } from "playwright";

const BASE = process.env.VAULT_BASE_URL ?? "http://localhost:3001";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@byteforce.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";

const results: { name: string; ms: number; budget: number }[] = [];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });

  // Warm the route once so we measure the app, not a cold start.
  await page.goto(`${BASE}/forms`, { waitUntil: "networkidle" });

  for (const [label, url] of [
    ["Forms, page 1 of 2,014", `${BASE}/forms`],
    ["Forms, filtered by company", `${BASE}/forms?company=BYTEFORCE`],
    ["Forms, free-text search", `${BASE}/forms?q=perf`],
    ["Forms, deep page", `${BASE}/forms?page=40`],
    ["Tasks", `${BASE}/tasks`],
    ["Sheets", `${BASE}/sheets`],
  ] as const) {
    const runs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.locator("h1").first().waitFor();
      runs.push(Date.now() - start);
    }
    const median = runs.sort((a, b) => a - b)[1]!;
    results.push({ name: label, ms: median, budget: 1500 });
  }

  // NFR-02 — the search endpoint itself.
  const searchRuns: number[] = [];
  for (let i = 0; i < 3; i++) {
    const ms = await page.evaluate(async () => {
      const t = performance.now();
      await fetch("/api/search?q=nile");
      return performance.now() - t;
    });
    searchRuns.push(Math.round(ms));
  }
  results.push({
    name: "Search API",
    ms: searchRuns.sort((a, b) => a - b)[1]!,
    budget: 1000,
  });

  await browser.close();

  console.log("\nmeasurement                       median    budget   verdict");
  console.log("-".repeat(64));
  let failed = 0;
  for (const r of results) {
    const ok = r.ms <= r.budget;
    if (!ok) failed++;
    console.log(
      `${r.name.padEnd(34)}${String(r.ms + "ms").padStart(7)}${String(r.budget + "ms").padStart(10)}   ${ok ? "PASS" : "FAIL"}`,
    );
  }
  console.log("-".repeat(64));
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
