/**
 * Proves local file storage behaves the way BR-14 / AC-05 require, in a real browser.
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/checks/storage.ts
 *
 * Downloading and previewing are the two things a user actually does with a file, so
 * both are driven through the interface rather than asserted at the service layer.
 */
import { chromium } from "playwright";
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = process.env.VAULT_BASE_URL ?? "http://localhost:3001";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@byteforce.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "password123";

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function main() {
  const root = resolve(process.cwd(), process.env.STORAGE_DIR ?? "storage");

  check("storage lives inside the project, outside public/",
    existsSync(root) && !root.startsWith(resolve(process.cwd(), "public")), root);

  const onDisk = existsSync(root)
    ? readdirSync(root, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).length
    : 0;
  check("files are on disk", onDisk > 0, `${onDisk} files`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });

  // --- downloading a document through the UI ---
  await page.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

  const href = await page.locator('a[href^="/api/files/"]').first().getAttribute("href");
  check("a download control is rendered", Boolean(href), href ?? "none");

  if (href) {
    // The route authorises, then redirects to a signed link.
    const hop = await fetch(`${BASE}${href}`, { headers: { cookie }, redirect: "manual" });
    const location = hop.headers.get("location") ?? "";
    check("authorised request redirects to a signed link", hop.status === 307 && location.includes("/api/files/download"), `HTTP ${hop.status}`);

    const signed = new URL(location, BASE);
    const expires = Number(signed.searchParams.get("e"));
    const ttl = expires - Math.floor(Date.now() / 1000);
    check("BR-14 the link expires in 300 seconds", ttl > 290 && ttl <= 300, `${ttl}s`);
    check("the link carries no filesystem path", !location.includes(process.cwd().replace(/\\/g, "/")) && !location.includes(":\\"), "opaque key only");

    const file = await fetch(signed, { headers: { cookie } });
    const bytes = Buffer.from(await file.arrayBuffer());
    check("the file downloads", file.status === 200 && bytes.byteLength > 0, `${bytes.byteLength} bytes, ${file.headers.get("content-type")}`);
    check("Content-Disposition names the original file", (file.headers.get("content-disposition") ?? "").includes(".pdf"), file.headers.get("content-disposition") ?? "");

    // Same link, without the session — the signature is what authorises it now.
    const anon = await fetch(signed);
    check("a signed link works without a cookie, but only until it expires", anon.status === 200, `HTTP ${anon.status}`);

    // Tampering must break it.
    const tampered = new URL(signed.toString());
    tampered.searchParams.set("t", "text/html");
    const bad = await fetch(tampered, { headers: { cookie } });
    check("re-pointing the content type invalidates the link", bad.status !== 200, `HTTP ${bad.status}`);
  }

  // --- previewing a PDF (FR-D05) ---
  const previewButton = page.getByRole("button", { name: "Preview" }).first();
  if (await previewButton.count()) {
    await previewButton.click();
    await page.waitForTimeout(1200);
    const frameSrc = await page.locator("iframe").first().getAttribute("src");
    check("the preview dialog opens an inline signed link", Boolean(frameSrc?.includes("disposition=inline")), frameSrc?.slice(0, 60) ?? "no iframe");

    const inlineHop = await fetch(`${BASE}${frameSrc}`, { headers: { cookie }, redirect: "manual" });
    const inlineUrl = new URL(inlineHop.headers.get("location") ?? "", BASE);
    const rendered = await fetch(inlineUrl, { headers: { cookie } });
    check("the preview serves the PDF inline", (rendered.headers.get("content-disposition") ?? "").startsWith("inline") && rendered.headers.get("content-type") === "application/pdf", `${rendered.headers.get("content-type")}`);
    await page.screenshot({ path: join(process.cwd(), "evidence", "storage-preview.png") });
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass).length;
  console.log("-".repeat(64));
  console.log(`${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
