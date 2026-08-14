/**
 * M0 interaction checks — run against the dev server.
 *   npx tsx scripts/checks/m0.ts
 *
 * Covers what M0 claims: the shell renders, the brand face actually loads (rather
 * than silently falling back), nav works, and the sidebar becomes a usable drawer
 * at 375px (NFR-03).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.VAULT_BASE_URL ?? "http://localhost:3001";
const OUT = join(process.cwd(), "evidence", "m0");

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // ---- Desktop: fonts, tokens, nav ----
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await desktop.newPage();
  await page.goto(`${BASE}/forms`, { waitUntil: "networkidle" });

  // next/font renames the family (e.g. `lama`) and adds a metric-matched
  // `lama fallback`. A real load means a non-fallback face reached status "loaded".
  const fontState = await page.evaluate(async () => {
    await document.fonts.ready;
    return Array.from(document.fonts)
      .filter((f) => /lama/i.test(f.family) && !/fallback/i.test(f.family))
      .map((f) => `${f.family}:${f.weight}:${f.status}`);
  });
  const fontLoaded = fontState.some((s) => s.endsWith(":loaded"));
  check("Lama Sans loads (no silent fallback)", fontLoaded, fontState.join(", ") || "no face found");

  const bodyFont = await page.evaluate(() =>
    getComputedStyle(document.body).fontFamily.toLowerCase(),
  );
  check("body uses Lama Sans", bodyFont.includes("lama"), bodyFont);

  const brandToken = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-brand").trim(),
  );
  check("brand token resolves to Royal Violet", brandToken.toLowerCase().includes("53449b"), brandToken);

  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await page.waitForURL("**/tasks");
  check("sidebar nav navigates", page.url().endsWith("/tasks"), page.url());

  const activeAria = await page
    .getByRole("link", { name: "Tasks", exact: true })
    .getAttribute("aria-current");
  check("active nav item marked aria-current", activeAria === "page", String(activeAria));

  // Focus ring visible (NFR-11)
  // Must be driven from the keyboard: Chromium only matches :focus-visible on a link
  // when focus arrived via keyboard, and NFR-11 is about the keyboard path anyway.
  // Tab 1 = skip link, Tab 2 = first nav item.
  await page.goto(`${BASE}/forms`, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(250); // let any colour transition settle before measuring
  const focus = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { style: "none", violetVar: "" };
    const s = getComputedStyle(el);
    return {
      style: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      violetVar: getComputedStyle(document.documentElement)
        .getPropertyValue("--color-violet")
        .trim(),
    };
  });
  check("keyboard focus has a visible outline", !focus.style.startsWith("none"), focus.style);
  // NFR-11 says the ring is violet specifically, not merely present.
  check(
    "focus ring is violet (83, 68, 155)",
    focus.style.includes("83, 68, 155"),
    `${focus.style} | --color-violet=${focus.violetVar || "UNDEFINED"}`,
  );
  await desktop.close();

  // ---- Mobile: drawer ----
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const m = await mobile.newPage();
  await m.goto(`${BASE}/forms`, { waitUntil: "networkidle" });

  const sidebarHidden = await m.locator("aside").isHidden();
  check("sidebar hidden below md", sidebarHidden);

  await m.getByRole("button", { name: "Open menu" }).click();
  await m.waitForTimeout(250);
  const drawerVisible = await m.getByRole("dialog").isVisible();
  check("hamburger opens the drawer", drawerVisible);
  await m.screenshot({ path: join(OUT, "drawer-mobile.png") });

  await m.getByRole("dialog").getByRole("link", { name: "Documents", exact: true }).click();
  await m.waitForURL("**/documents");
  check("drawer nav navigates and closes", m.url().endsWith("/documents"), m.url());

  const noHScroll = await m.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  check("no horizontal scroll at 375px", noHScroll);
  await mobile.close();

  await browser.close();

  console.log("\nM0 checks\n" + "-".repeat(60));
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log("-".repeat(60));
  console.log(`${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
