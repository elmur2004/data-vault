/**
 * Browser verification helper.
 *
 * .agents/rules/20-verification.md: a milestone is not done until its flows were
 * exercised in a real browser, with desktop and 375px screenshots as evidence.
 *
 *   npx tsx scripts/shots.ts <milestone> <route> [route...]
 *   npx tsx scripts/shots.ts m0 /forms /sheets /documents /tasks
 *
 * Set VAULT_STORAGE_STATE to a Playwright storage-state file to shoot as a signed-in
 * user (used from M1 onward).
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.VAULT_BASE_URL ?? "http://localhost:3001";
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 375, height: 812 },
] as const;

async function main() {
  const [milestone, ...routes] = process.argv.slice(2);
  if (!milestone || routes.length === 0) {
    console.error("usage: tsx scripts/shots.ts <milestone> <route> [route...]");
    process.exit(1);
  }

  const outDir = join(process.cwd(), "evidence", milestone);
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const consoleErrors: string[] = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      storageState: process.env.VAULT_STORAGE_STATE || undefined,
    });
    const page: Page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(`[${vp.name}] ${m.text()}`);
    });
    page.on("pageerror", (e) => consoleErrors.push(`[${vp.name}] pageerror: ${e.message}`));

    for (const route of routes) {
      const slug = route.replace(/^\//, "").replace(/[/?=&]/g, "-") || "root";
      const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(350);
      const file = join(outDir, `${slug}-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: vp.name === "desktop" });
      console.log(`${res?.status() ?? "?"}  ${route}  ${vp.name}  ->  ${file}`);
    }
    await context.close();
  }

  await browser.close();

  if (consoleErrors.length) {
    console.log("\nCONSOLE ERRORS:");
    for (const e of consoleErrors) console.log("  " + e);
    process.exitCode = 1;
  } else {
    console.log("\nNo console errors.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
