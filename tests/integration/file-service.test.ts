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
import { BUCKET, SIGNED_URL_TTL } from "@/server/files/storage";

/**
 * M2 integration — the shared file service against the real MinIO and Postgres.
 *
 * Covers §6.7, §10.3, BR-04, BR-14 and the mechanism behind AC-05/AC-06. The
 * acceptance runs land on the real Sheets and Documents paths in M4/M5; this proves
 * the machinery all three sections share.
 */

const db = new PrismaClient();
const ENDPOINT = (process.env.S3_ENDPOINT ?? "").replace(/\/$/, "");
let uploader = "";

const asFile = (bytes: Buffer, name: string) =>
  new File([new Uint8Array(bytes)], name, { type: "application/octet-stream" });
const pdfBytes = () => Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const csvBytes = (rows: number) =>
  Buffer.from(["name,email", ...Array.from({ length: rows }, (_, i) => `p${i},p${i}@x.test`)].join("\n"));

beforeAll(async () => {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Run `npm run db:seed` first — no admin user exists.");
  uploader = admin.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("§10.3 filename handling", () => {
  it("strips path components and control characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
    expect(sanitizeFilename("  spaced   name.pdf ")).toBe("spaced name.pdf");
  });
});

describe("BR-04 / AC-06 — content inspection through the real pipeline", () => {
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

  it("enforces per-context allowlists — a CSV is not a document", async () => {
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

describe("§6.7 storing an upload", () => {
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
    // §10.3: scanned before it can be served.
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

describe("BR-14 / AC-05 — private storage, signed URLs", () => {
  it("does not serve the raw storage path without credentials", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "private.pdf"),
      uploadedBy: uploader,
    });

    const res = await fetch(`${ENDPOINT}/${BUCKET}/${file.storageKey}`);
    expect(res.status).not.toBe(200);
  });

  it("issues a working URL that expires in exactly 300 seconds", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "signed.pdf"),
      uploadedBy: uploader,
    });

    const { url } = await issueDownloadUrl({ fileId: file.id });
    const res = await fetch(url);
    expect(res.status).toBe(200);

    expect(SIGNED_URL_TTL).toBe(300);
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("refuses a tampered signature", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "tamper.pdf"),
      uploadedBy: uploader,
    });
    const { url } = await issueDownloadUrl({ fileId: file.id });
    const tampered = url.replace(/(X-Amz-Signature=)([0-9a-f])/, (_m, p, c) => `${p}${c === "0" ? "1" : "0"}`);
    const res = await fetch(tampered);
    expect(res.status).not.toBe(200);
  });

  it("sets Content-Disposition to the original filename", async () => {
    const { file } = await storeUpload({
      scope: "document",
      file: asFile(pdfBytes(), "Q4 report.pdf"),
      uploadedBy: uploader,
    });
    const { url } = await issueDownloadUrl({ fileId: file.id });
    const disposition = new URL(url).searchParams.get("response-content-disposition") ?? "";
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
    expect(new URL(url).searchParams.get("response-content-disposition")).toMatch(/^inline/);
  });

  it("§10.3 refuses to serve a file that is not CLEAN", async () => {
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

describe("FR-S06 / FR-D06 — versioning keeps the previous file", () => {
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

    const stillWorks = await fetch((await issueDownloadUrl({ fileId: v1.id })).url);
    expect(stillWorks.status).toBe(200);

    const chain = await fileVersions(v2.id);
    expect(chain.map((f) => f.version)).toEqual([2, 1]);
  });
});
