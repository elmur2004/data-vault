import { describe, expect, it } from "vitest";
import { detectType, isAllowed, MIME } from "./inspect";

/**
 * BR-04 / AC-06 — content inspection.
 * .agents/rules/20-verification.md requires unit tests on the upload allowlists,
 * because this is the logic that stands between "validated" and "validated by name".
 */

/** Minimal real-ish fixtures: the bytes that actually decide each verdict. */
function pdf(): Buffer {
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n"),
    Buffer.from("1 0 obj\n<< /Type /Catalog >>\nendobj\n"),
    Buffer.from("%%EOF\n"),
  ]);
}

function png(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
    Buffer.alloc(24),
  ]);
}

/**
 * A ZIP whose stored path strings identify it as OOXML. `detectType` reads the part
 * names, so a plausible listing is enough to exercise the discrimination branch.
 */
function ooxmlZip(prefix: "xl/" | "word/" | "ppt/"): Buffer {
  const names = `[Content_Types].xml${prefix}workbook.xml`;
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(26),
    Buffer.from(names),
  ]);
}

/** A ZIP with none of the OOXML parts — a plain archive someone renamed. */
function plainZip(): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(26),
    Buffer.from("holiday-photos/IMG_0001.JPG"),
  ]);
}

describe("detectType — magic bytes decide, not the extension", () => {
  it("identifies a real PDF", async () => {
    expect(await detectType(pdf(), "contract.pdf")).toMatchObject({ ext: "pdf", mime: MIME.pdf });
  });

  it("AC-06: a .txt renamed .pdf is not a PDF", async () => {
    const text = Buffer.from("This is definitely not a PDF, whatever the name says.\n");
    const detected = await detectType(text, "definitely-a-contract.pdf");
    expect(detected?.ext).not.toBe("pdf");
    expect(isAllowed("document", detected?.ext ?? "")).toBe(false);
  });

  it("AC-06: an executable renamed .pdf is rejected for documents", async () => {
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0x00), Buffer.from("PE\0\0")]);
    const detected = await detectType(exe, "invoice.pdf");
    expect(isAllowed("document", detected?.ext ?? "")).toBe(false);
  });

  it("identifies PNG", async () => {
    expect((await detectType(png(), "shot.png"))?.ext).toBe("png");
  });
});

describe("OOXML containers are discriminated, not taken at face value", () => {
  it("recognises an xlsx by its parts", async () => {
    expect((await detectType(ooxmlZip("xl/"), "leads.xlsx"))?.ext).toBe("xlsx");
  });

  it("recognises a docx by its parts", async () => {
    expect((await detectType(ooxmlZip("word/"), "proposal.docx"))?.ext).toBe("docx");
  });

  it("R-4: a plain zip renamed .xlsx does not pass as a spreadsheet", async () => {
    const detected = await detectType(plainZip(), "leads.xlsx");
    expect(detected?.ext).toBe("zip");
    expect(isAllowed("sheet", detected?.ext ?? "")).toBe(false);
  });
});

describe("CSV and text sniffing (no magic bytes exist)", () => {
  it("detects a comma-delimited CSV", async () => {
    const csv = Buffer.from("name,email,company\nNour,nour@x.test,ByteForce\nOmar,omar@x.test,B-Systems\n");
    expect((await detectType(csv, "leads.csv"))?.ext).toBe("csv");
  });

  it("detects a semicolon-delimited CSV", async () => {
    const csv = Buffer.from("name;email\nNour;nour@x.test\nOmar;omar@x.test\n");
    expect((await detectType(csv, "leads.csv"))?.ext).toBe("csv");
  });

  it("detects a tab-delimited CSV", async () => {
    const csv = Buffer.from("name\temail\nNour\tnour@x.test\nOmar\tomar@x.test\n");
    expect((await detectType(csv, "leads.csv"))?.ext).toBe("csv");
  });

  it("survives a UTF-8 BOM and CRLF line endings", async () => {
    const csv = Buffer.from("﻿name,email\r\nNour,nour@x.test\r\nOmar,omar@x.test\r\n");
    expect((await detectType(csv, "leads.csv"))?.ext).toBe("csv");
  });

  it("does not split on delimiters inside quoted fields", async () => {
    const csv = Buffer.from('name,notes\n"Nour, A.",ok\n"Omar, B.",fine\n');
    expect((await detectType(csv, "leads.csv"))?.ext).toBe("csv");
  });

  it("rejects binary content that claims to be CSV", async () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff, 0xfe, 0x00, 0x03]);
    const detected = await detectType(binary, "leads.csv");
    expect(isAllowed("sheet", detected?.ext ?? "")).toBe(false);
  });

  it("prose is text, not CSV", async () => {
    const prose = Buffer.from("Just some notes about the quarter.\nNothing tabular here at all.\n");
    expect((await detectType(prose, "notes.txt"))?.ext).toBe("txt");
  });
});

describe("per-context allowlists (§10.3, DF-03)", () => {
  it("sheets accept spreadsheets only", () => {
    expect(isAllowed("sheet", "xlsx")).toBe(true);
    expect(isAllowed("sheet", "csv")).toBe(true);
    expect(isAllowed("sheet", "xls")).toBe(true);
    expect(isAllowed("sheet", "pdf")).toBe(false);
  });

  it("documents accept pdf/docx/xlsx only (FR-D03)", () => {
    expect(isAllowed("document", "pdf")).toBe(true);
    expect(isAllowed("document", "docx")).toBe(true);
    expect(isAllowed("document", "xlsx")).toBe(true);
    expect(isAllowed("document", "csv")).toBe(false);
    expect(isAllowed("document", "png")).toBe(false);
  });

  it("task attachments are wider — a result is legitimately a screenshot (DF-03)", () => {
    expect(isAllowed("attachment", "png")).toBe(true);
    expect(isAllowed("attachment", "jpg")).toBe(true);
    expect(isAllowed("attachment", "txt")).toBe(true);
    expect(isAllowed("attachment", "zip")).toBe(false);
  });
});
