import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  storeUpload,
  replaceUpload,
  issueDownloadUrl,
  fileVersions,
  sanitizeFilename,
  MAX_UPLOAD_MB,
} from "@/server/files/service";
import { SIGNED_URL_TTL, pathForKey, storageRoot } from "@/server/files/storage";
import { sign } from "@/server/files/signing";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * M2 integration - the shared file service against the real MinIO and Postgres.
 *
 * Covers Â§6.7, Â§10.3, BR-04, BR-14 and the mechanism behind AC-05/AC-06. The
 * acceptance runs land on the real Sheets and Documents paths in M4/M5; this proves
 * the machinery all three sections share.
 */

const db = new PrismaClient();
const BASE = process.env.APP_URL ?? "http://localhost:3001";
let uploader = "";

const asFile = (bytes: Buffer, name: string) =>
  new File([new Uint8Array(bytes)], name, { type: "application/octet-stream" });
const pdfBytes = () => Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const csvBytes = (rows: number) =>
  Buffer.from(["name,email", ...Array.from({ length: rows }, (_, i) => `p${i},p${i}@x.test`)].join("\n"));

beforeAll(async () => {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Run `npm run db:seed` first - no admin user exists.");
  uploader = admin.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("-10.3 filename handling", () => {
  it("strips path components and control characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
    expect(sanitizeFilename("  spaced   name.pdf ")).toBe("spaced name.pdf");
  });
});

describe("BR-04 / AC-06 - content inspection through the real pipeline", () => {
  it("refuses a .txt renamed .pdf and leaves no row behind", async () => {
    await expect(
      storeUpload({
        scope: "document",
        file: asFile(Buffer.from("I am plainly not a PDF.\n"), "definitely-a-contract.pdf"),
        uploadedBy: uploader,
      }),
    ).rejects.toThrow();

    const orphaned = await db.storedFile.count({
      where: { originalFilename: "definitely-a-contract.pdf" },
    });
    expect(orphaned).toBe(0);
  });

  it("enforces per-context allowlists - a CSV is not a document", async () => {
    await expect(
      storeUpload({ scope: "document", file: asFile(csvBytes(3), "leads.csv"), uploadedBy: uploader }),
    ).rejects.toThrow();
  });

  it(`refuses files over ${MAX_UPLOAD_MB} MB (D-09)`, async () => {
    const big = Buffer.alloc((MAX_UPLOAD_MB + 1) * 1024 * 1024, 0x41);
    await expect(
      storeUpload({ scope: "document", file: asFile(big, "huge.pdf"), uploadedBy: uploader }),
    ).rejects.toThrow(new RegExp(String(MAX_UPLOAD_MB)));
  });

  it("refuses an empty file", async () => {
    await expect(
      storeUpload({ scope: "document", file: asFile(Buffer.alloc(0), "empty.pdf"), uploadedBy: uploader }),
    ).rejects.toThrow();
  });
});

describe("-6.7 storing an upload", () => {
  it("records the inspected type, a non-guessable key, and the original name", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "Q3 contract.pdf"),
      uploadedBy: uploader,
    });

    expect(file.mimeType).toBe("application/pdf");
    expect(file.originalFilename).toBe("Q3 contract.pdf");
    // The key must not leak the filename and must not be sequential.
    expect(file.storageKey).not.toContain("contract");
    expect(file.storageKey).toMatch(/^documents\/[0-9a-f-]{36}$/);
    // Â§10.3: scanned before it can be served.
    expect(file.scanStatus).toBe("CLEAN");
  });

  it("accepts CSV for sheets", async () => {
    const { file, detectedExt } = await storeUpload({
      scope: "sheet",
      file: asFile(csvBytes(12), "leads.csv"),
      uploadedBy: uploader,
    });
    expect(detectedExt).toBe("csv");
    expect(file.mimeType).toBe("text/csv");
  });
});

describe("BR-14 / AC-05 - private storage, signed links", () => {
  it("stores files outside public/, so nothing serves them statically", () => {
    const root = storageRoot();
    const publicDir = resolve(process.cwd(), "public");
    expect(root.startsWith(publicDir)).toBe(false);
    expect(existsSync(root)).toBe(true);
  });

  it("does not serve the file over HTTP without a signed link", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "private.pdf"),
      uploadedBy: uploader,
    });

    // Every shape someone might guess: a static path, the bare key, and the download
    // route without a signature.
    //
    // The assertion is on the *bytes*, not the status: an unauthenticated request is
    // redirected to /login, which legitimately answers 200. What must never happen is
    // the file itself coming back.
    for (const url of [
      `${BASE}/storage/${file.storageKey}`,
      `${BASE}/${file.storageKey}`,
      `${BASE}/api/files/download?k=${encodeURIComponent(file.storageKey)}`,
      `${BASE}/api/files/${file.id}`,
    ]) {
      const res = await fetch(url).catch(() => null);
      const body = res ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
      expect(body.includes(Buffer.from("%PDF")), `${url} returned the file`).toBe(false);
    }
  });

  it("issues a link that expires in exactly 300 seconds", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "signed.pdf"),
      uploadedBy: uploader,
    });

    const { url } = await issueDownloadUrl({ fileId: file.id });
    const params = new URL(url, BASE).searchParams;
    const expires = Number(params.get("e"));
    const ttl = expires - Math.floor(Date.now() / 1000);

    expect(SIGNED_URL_TTL).toBe(300);
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);

    const res = await fetch(new URL(url, BASE));
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(pdfBytes());
  });

  it("refuses an expired link", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "expired.pdf"),
      uploadedBy: uploader,
    });
    const stored = await db.storedFile.findUniqueOrThrow({ where: { id: file.id } });

    // Signed correctly, but for a moment that has already passed.
    const expires = Math.floor(Date.now() / 1000) - 1;
    const parts = {
      key: stored.storageKey,
      expires,
      disposition: "attachment" as const,
      filename: stored.originalFilename,
      contentType: stored.mimeType,
    };
    const qs = new URLSearchParams({
      k: parts.key,
      e: String(expires),
      d: parts.disposition,
      n: parts.filename,
      t: parts.contentType,
      s: sign(parts),
    });

    const res = await fetch(`${BASE}/api/files/download?${qs}`);
    expect(res.status).toBe(410);
  });

  it("refuses a tampered signature, key, expiry, disposition or type", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "tamper.pdf"),
      uploadedBy: uploader,
    });
    const { url } = await issueDownloadUrl({ fileId: file.id });
    const base = new URL(url, BASE);

    const mutations: [string, (u: URL) => void][] = [
      ["signature", (u) => u.searchParams.set("s", "AAAA" + u.searchParams.get("s")!.slice(4))],
      ["key", (u) => u.searchParams.set("k", "documents/00000000-0000-0000-0000-000000000000")],
      ["expiry", (u) => u.searchParams.set("e", String(Number(u.searchParams.get("e")) + 86400))],
      ["disposition", (u) => u.searchParams.set("d", "inline")],
      // The type is signed too: otherwise a link could be re-pointed at text/html.
      ["contentType", (u) => u.searchParams.set("t", "text/html")],
    ];

    for (const [what, mutate] of mutations) {
      const u = new URL(base.toString());
      mutate(u);
      const res = await fetch(u);
      expect(res.status, `${what} should not be accepted`).not.toBe(200);
    }
  });

  it("refuses a key that tries to escape the storage directory", async () => {
    for (const key of ["../.env", "documents/../../.env", "/etc/passwd", "documents/a/../../b"]) {
      expect(() => pathForKey(key)).toThrow();
    }
  });

  it("sets Content-Disposition to the original filename", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "Q4 report.pdf"),
      uploadedBy: uploader,
    });
    const { url } = await issueDownloadUrl({ fileId: file.id });
    const res = await fetch(new URL(url, BASE));
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("Q4 report.pdf");
    expect(disposition).toMatch(/^attachment/);
  });

  it("serves the PDF preview inline (FR-D05)", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "preview.pdf"),
      uploadedBy: uploader,
    });
    const { url } = await issueDownloadUrl({ fileId: file.id, disposition: "inline" });
    const res = await fetch(new URL(url, BASE));
    expect(res.headers.get("content-disposition")).toMatch(/^inline/);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("-10.3 refuses to serve a file that is not CLEAN", async () => {
    const held = await db.storedFile.create({
      data: {
        originalFilename: "held.pdf",
        storageKey: `documents/held-${crypto.randomUUID()}`,
        mimeType: "application/pdf",
        sizeBytes: 10,
        uploadedBy: uploader,
        scanStatus: "PENDING",
      },
    });
    await expect(issueDownloadUrl({ fileId: held.id })).rejects.toThrow();
  });

  it("refuses an unknown file id without revealing anything", async () => {
    await expect(issueDownloadUrl({ fileId: crypto.randomUUID() })).rejects.toThrow();
  });
});
describe("FR-S06 / FR-D06 - versioning keeps the previous file", () => {
  it("increments the version, links the chain, and keeps the old file retrievable", async () => {
    const { file: v1 } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "policy.pdf"),
      uploadedBy: uploader,
    });

    const { file: v2 } = await replaceUpload({
      scope: "document",
      file: asFile(Buffer.concat([pdfBytes(), Buffer.from("v2\n")]), "policy v2.pdf"),
      uploadedBy: uploader,
      previousFileId: v1.id,
    });

    expect(v2.version).toBe(2);
    expect(v2.replacesId).toBe(v1.id);

    // BR-11: the previous version is retained, never deleted.
    const previous = await db.storedFile.findUnique({ where: { id: v1.id } });
    expect(previous).not.toBeNull();

    const stillWorks = await fetch(new URL((await issueDownloadUrl({ fileId: v1.id })).url, BASE));
    expect(stillWorks.status).toBe(200);

    const chain = await fileVersions(v2.id);
    expect(chain.map((f) => f.version)).toEqual([2, 1]);
  });
});
