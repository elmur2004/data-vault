import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { sheetInput } from "@/lib/validation/sheet";
import { createSheet, listSheets, uploadSheetFile, archiveSheet } from "@/server/sheets/service";
import { createDocument, listDocuments, uploadDocumentFile } from "@/server/documents/service";
import { search } from "@/server/search/service";
import { createTask } from "@/server/tasks/service";
import type { SessionUser } from "@/server/auth/guards";
import { sheetListParams } from "@/lib/validation/sheet";
import { documentListParams } from "@/lib/validation/document";

/**
 * M4 Sheets (AC-03, AC-04), M5 Documents, M7 Search (AC-17).
 */

const db = new PrismaClient();
const tag = `s${Date.now().toString(36)}`;
let adminUser: SessionUser;
let employeeUser: SessionUser;
let employeeId = "";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const sheetParams = (o: Record<string, unknown> = {}) => sheetListParams.parse(o);
const docParams = (o: Record<string, unknown> = {}) => documentListParams.parse(o);

/** A genuine XLSX, built in memory, so AC-04 counts a real file. */
async function makeXlsx(dataRows: number): Promise<File> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.addRow(["name", "email", "score"]);
  for (let i = 0; i < dataRows; i++) ws.addRow([`Person ${i}`, `p${i}@x.test`, i]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new File([new Uint8Array(buf)], "leads.xlsx");
}

const pdf = () =>
  new File([new Uint8Array(Buffer.from("%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n"))], "contract.pdf");

beforeAll(async () => {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Run `npm run db:seed` first.");
  adminUser = { id: admin.id, name: admin.name, email: admin.email, role: "ADMIN", employeeId: null };

  const emp = await db.employee.create({
    data: { fullName: `${tag} Searcher`, email: `${tag}-search@x.test` },
  });
  employeeId = emp.id;
  employeeUser = {
    id: `${tag}-u`,
    name: "Searcher",
    email: emp.email,
    role: "EMPLOYEE",
    employeeId: emp.id,
  };
});

afterAll(async () => {
  await db.task.deleteMany({ where: { name: { contains: tag } } });
  await db.employee.deleteMany({ where: { email: { contains: tag } } });
  await db.document.deleteMany({ where: { name: { contains: tag } } });
  await db.sheet.deleteMany({ where: { name: { contains: tag } } });
  await db.form.deleteMany({ where: { name: { contains: tag } } });
  await db.$disconnect();
});

describe("BR-02 / AC-03 — a sheet has exactly one of a URL or a file", () => {
  const base = {
    name: "X",
    dateCreated: "2026-07-12",
    company: "BYTEFORCE",
    type: "LEADS",
  };

  it("rejects a sheet with neither", () => {
    // No storageMode discriminant at all, and no url/fileId.
    expect(sheetInput.safeParse({ ...base }).success).toBe(false);
    expect(sheetInput.safeParse({ ...base, storageMode: "LINK" }).success).toBe(false);
    expect(sheetInput.safeParse({ ...base, storageMode: "FILE" }).success).toBe(false);
  });

  it("rejects a LINK sheet that also carries a file", () => {
    const parsed = sheetInput.safeParse({
      ...base,
      storageMode: "LINK",
      url: "https://sheets.test/a",
      fileId: "some-file-id",
    });
    // The discriminated union drops the foreign key rather than storing both.
    expect(parsed.success).toBe(true);
    if (parsed.success) expect("fileId" in parsed.data).toBe(false);
  });

  it("the database refuses both, even if every layer above were bypassed", async () => {
    const { file } = await uploadSheetFile({ file: await makeXlsx(3), uploadedBy: adminUser.id });
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO "Sheet" ("id","name","storageMode","url","fileId","dateCreated","company","type","createdBy","isArchived","createdAt","updatedAt")
         VALUES (gen_random_uuid(), '${tag} illegal', 'LINK', 'https://x.test/a', '${file.id}', '2026-07-12', 'BYTEFORCE', 'LEADS', '${adminUser.id}', false, now(), now())`,
      ),
    ).rejects.toThrow(/sheet_storage_exclusive/);
  });

  it("the database refuses neither", async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO "Sheet" ("id","name","storageMode","url","fileId","dateCreated","company","type","createdBy","isArchived","createdAt","updatedAt")
         VALUES (gen_random_uuid(), '${tag} empty', 'LINK', NULL, NULL, '2026-07-12', 'BYTEFORCE', 'LEADS', '${adminUser.id}', false, now(), now())`,
      ),
    ).rejects.toThrow(/sheet_storage_exclusive/);
  });

  it("accepts a link-only sheet", async () => {
    const parsed = sheetInput.parse({
      ...base,
      name: `${tag} linked`,
      storageMode: "LINK",
      url: "https://docs.google.test/spreadsheets/1",
    });
    const sheet = await createSheet(adminUser.id, { input: parsed });
    expect(sheet.url).toContain("docs.google.test");
    expect(sheet.fileId).toBeNull();
  });
});

describe("BR-03 — a manual record count needs its as-of date", () => {
  it("rejects a bare number", () => {
    const parsed = sheetInput.safeParse({
      name: "X",
      dateCreated: "2026-07-12",
      company: "BYTEFORCE",
      type: "LEADS",
      storageMode: "LINK",
      url: "https://x.test/a",
      lastRecordCount: 1240,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes("lastRecordCountAsOf"))).toBe(true);
    }
  });

  it("accepts a number with its date", () => {
    const parsed = sheetInput.safeParse({
      name: "X",
      dateCreated: "2026-07-12",
      company: "BYTEFORCE",
      type: "LEADS",
      storageMode: "LINK",
      url: "https://x.test/a",
      lastRecordCount: 1240,
      lastRecordCountAsOf: "2026-07-12",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("AC-04 — the record count is computed from an uploaded XLSX", () => {
  it("counts the populated data rows and stamps today as the as-of date", async () => {
    const uploaded = await uploadSheetFile({ file: await makeXlsx(37), uploadedBy: adminUser.id });

    expect(uploaded.lastRecordCount).toBe(37); // header excluded
    expect(uploaded.headerDetected).toBe(true);
    expect(uploaded.countable).toBe(true);

    // "Today" means today in Africa/Cairo (BR-15), not in UTC. Between midnight and
    // 02:00 Cairo those are different dates, and comparing against the UTC date makes
    // this test fail for two hours a night while the app is behaving correctly.
    const { todayInCairo } = await import("@/lib/datetime");
    expect(uploaded.lastRecordCountAsOf?.toISOString().slice(0, 10)).toBe(
      todayInCairo().toISOString().slice(0, 10),
    );

    const sheet = await createSheet(adminUser.id, {
      input: sheetInput.parse({
        name: `${tag} counted`,
        dateCreated: "2026-07-12",
        company: "BYTEFORCE",
        type: "LEADS",
        storageMode: "FILE",
        fileId: uploaded.file.id,
      }),
      computed: {
        lastRecordCount: uploaded.lastRecordCount,
        lastRecordCountAsOf: uploaded.lastRecordCountAsOf,
      },
    });

    expect(sheet.lastRecordCount).toBe(37);
    expect(sheet.lastRecordCountAsOf).not.toBeNull();
  });

  it("FR-S06 — replacing the file recounts and keeps the previous version", async () => {
    const first = await uploadSheetFile({ file: await makeXlsx(5), uploadedBy: adminUser.id });
    const second = await uploadSheetFile({
      file: await makeXlsx(11),
      uploadedBy: adminUser.id,
      previousFileId: first.file.id,
    });

    expect(second.lastRecordCount).toBe(11);
    expect(second.file.version).toBe(2);
    expect(second.file.replacesId).toBe(first.file.id);
    expect(await db.storedFile.findUnique({ where: { id: first.file.id } })).not.toBeNull();
  });
});

describe("FR-S07 / FR-S08 — filtering and search", () => {
  it("filters by company and type, and searches name and notes", async () => {
    await createSheet(adminUser.id, {
      input: sheetInput.parse({
        name: `${tag} campaign list`,
        dateCreated: "2026-07-01",
        company: "BSYSTEMS",
        type: "CAMPAIGN_LEADS",
        storageMode: "LINK",
        url: "https://x.test/campaign",
        notes: "quarterly push",
      }),
    });

    const byType = await listSheets(sheetParams({ q: tag, type: "CAMPAIGN_LEADS" }));
    expect(byType.rows.every((r) => r.type === "CAMPAIGN_LEADS")).toBe(true);

    const byCompany = await listSheets(sheetParams({ q: tag, company: "BSYSTEMS" }));
    expect(byCompany.rows.every((r) => r.company === "BSYSTEMS")).toBe(true);

    const byNotes = await listSheets(sheetParams({ q: "quarterly push" }));
    expect(byNotes.rows.length).toBeGreaterThan(0);
  });

  it("archived sheets leave the default view and the count", async () => {
    const sheet = await createSheet(adminUser.id, {
      input: sheetInput.parse({
        name: `${tag} archive me`,
        dateCreated: "2026-07-01",
        company: "BYTEFORCE",
        type: "DATA",
        storageMode: "LINK",
        url: "https://x.test/archive-me",
      }),
    });
    const before = await listSheets(sheetParams({ q: tag }));
    await archiveSheet(adminUser.id, sheet.id);
    const after = await listSheets(sheetParams({ q: tag }));
    expect(after.total).toBe(before.total - 1);
    expect(after.rows.some((r) => r.id === sheet.id)).toBe(false);
  });
});

describe("M5 — Documents", () => {
  it("stores a document with an optional description (D-07) and filters by type", async () => {
    const uploaded = await uploadDocumentFile({ file: pdf(), uploadedBy: adminUser.id });

    const withoutDescription = await createDocument(adminUser.id, {
      name: `${tag} bare contract`,
      description: null,
      company: "BYTEFORCE",
      type: "CONTRACT",
      fileId: uploaded.file.id,
    });
    expect(withoutDescription.description).toBeNull();

    const second = await uploadDocumentFile({ file: pdf(), uploadedBy: adminUser.id });
    await createDocument(adminUser.id, {
      name: `${tag} proposal`,
      description: "Pitch for the retainer",
      company: "BSYSTEMS",
      type: "PROPOSAL",
      fileId: second.file.id,
    });

    const contracts = await listDocuments(docParams({ q: tag, type: "CONTRACT" }));
    expect(contracts.rows.every((r) => r.type === "CONTRACT")).toBe(true);

    // FR-D08 — search covers the description.
    const byDescription = await listDocuments(docParams({ q: "retainer" }));
    expect(byDescription.rows.length).toBeGreaterThan(0);
  });

  it("FR-D03 — refuses a file type that is not PDF, DOCX or XLSX", async () => {
    const csv = new File([new Uint8Array(Buffer.from("a,b\n1,2\n"))], "notes.csv");
    await expect(uploadDocumentFile({ file: csv, uploadedBy: adminUser.id })).rejects.toThrow();
  });
});

describe("AC-17 — global search, grouped by section", () => {
  it("returns matches from all four sections under their own headings", async () => {
    const term = `${tag}zephyr`;

    await db.form.create({
      data: {
        name: `${tag} ${term} form`,
        url: "https://x.test/z",
        company: "BYTEFORCE",
        createdBy: adminUser.id,
      },
    });
    await createSheet(adminUser.id, {
      input: sheetInput.parse({
        name: `${tag} ${term} sheet`,
        dateCreated: "2026-07-01",
        company: "BYTEFORCE",
        type: "DATA",
        storageMode: "LINK",
        url: "https://x.test/zs",
      }),
    });
    const f = await uploadDocumentFile({ file: pdf(), uploadedBy: adminUser.id });
    await createDocument(adminUser.id, {
      name: `${tag} ${term} document`,
      description: null,
      company: "BYTEFORCE",
      type: "REPORT",
      fileId: f.file.id,
    });
    await createTask(adminUser.id, {
      employeeId,
      name: `${tag} ${term} task`,
      description: null,
      company: null,
      deadline: day("2026-09-01"),
    });

    const results = await search(adminUser, term);
    expect(results.groups.forms.length).toBe(1);
    expect(results.groups.sheets.length).toBe(1);
    expect(results.groups.documents.length).toBe(1);
    expect(results.groups.tasks.length).toBe(1);
    expect(results.total).toBe(4);
  });

  it("R-2 — an employee's search never surfaces another employee's task", async () => {
    const term = `${tag}private`;
    const other = await db.employee.create({
      data: { fullName: `${tag} Other`, email: `${tag}-other@x.test` },
    });
    await createTask(adminUser.id, {
      employeeId: other.id,
      name: `${tag} ${term} someone elses task`,
      description: null,
      company: null,
      deadline: day("2026-09-01"),
    });

    const asAdmin = await search(adminUser, term);
    expect(asAdmin.groups.tasks.length).toBe(1);

    const asEmployee = await search(employeeUser, term);
    expect(asEmployee.groups.tasks).toHaveLength(0);
    expect(JSON.stringify(asEmployee)).not.toContain("someone elses");
  });

  it("excludes archived records", async () => {
    const term = `${tag}buried`;
    const form = await db.form.create({
      data: {
        name: `${tag} ${term}`,
        url: "https://x.test/b",
        company: "BYTEFORCE",
        createdBy: adminUser.id,
      },
    });
    expect((await search(adminUser, term)).groups.forms).toHaveLength(1);

    await db.form.update({ where: { id: form.id }, data: { isArchived: true } });
    expect((await search(adminUser, term)).groups.forms).toHaveLength(0);
  });

  it("ignores a term too short to be useful", async () => {
    expect((await search(adminUser, "a")).total).toBe(0);
  });
});
