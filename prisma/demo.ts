/**
 * Demo content, so every screen and every state can actually be looked at.
 *
 *   npm run db:demo            add the demo content
 *   npm run db:demo -- --reset remove it first, then add it again
 *
 * Deliberately includes the awkward states, not just the happy ones: an overdue task,
 * a task completed late, a task completed on time, a linked sheet with a manual count
 * and an uploaded sheet with a computed one, and one archived record so the archive is
 * not empty.
 */
import "../scripts/_env";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const db = new PrismaClient();
const RESET = process.argv.includes("--reset");
const TAG = "demo";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return day(d.toISOString().slice(0, 10));
};

const PEOPLE = [
  { fullName: "Hana Mostafa", jobTitle: "Performance marketing lead", company: "BYTEFORCE" as const },
  { fullName: "Karim Adel", jobTitle: "Senior art director", company: "BYTEFORCE" as const },
  { fullName: "Nour El-Sayed", jobTitle: "Account manager", company: null },
  { fullName: "Omar Fathy", jobTitle: "Systems engineer", company: "BSYSTEMS" as const },
  { fullName: "Salma Ibrahim", jobTitle: "Content strategist", company: "BYTEFORCE" as const },
  { fullName: "Youssef Nabil", jobTitle: "Media buyer", company: "BSYSTEMS" as const },
];

async function reset() {
  await db.taskAttachment.deleteMany({ where: { task: { employee: { email: { contains: TAG } } } } });
  await db.task.deleteMany({ where: { employee: { email: { contains: TAG } } } });
  await db.invitation.deleteMany({ where: { employee: { email: { contains: TAG } } } });
  const emps = await db.employee.findMany({
    where: { email: { contains: TAG } },
    select: { userId: true },
  });
  await db.employee.deleteMany({ where: { email: { contains: TAG } } });
  for (const e of emps) if (e.userId) await db.user.delete({ where: { id: e.userId } }).catch(() => {});
  await db.form.deleteMany({ where: { createdBy: "demo-seed" } });
  await db.sheet.deleteMany({ where: { createdBy: "demo-seed" } });
  await db.document.deleteMany({ where: { createdBy: "demo-seed" } });
  console.log("demo content removed");
}

async function main() {
  if (RESET) await reset();

  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Run `npm run db:seed` first — no admin exists.");

  // ── People ────────────────────────────────────────────────────────────────
  const employees = [];
  for (const p of PEOPLE) {
    const email = `${p.fullName.split(" ")[0]!.toLowerCase()}.${TAG}@byteforce.local`;
    const existing = await db.employee.findUnique({ where: { email } });
    employees.push(existing ?? (await db.employee.create({ data: { ...p, email } })));
  }

  // One of them can sign in, so the employee view is reachable.
  const hana = employees[0]!;
  if (!hana.userId) {
    const user = await db.user.create({
      data: { name: hana.fullName, email: hana.email, emailVerified: true, role: "EMPLOYEE" },
    });
    await db.account.create({
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: await hashPassword("employee-demo-pass"),
      },
    });
    await db.employee.update({ where: { id: hana.id }, data: { userId: user.id } });
    console.log(`employee login: ${hana.email} / employee-demo-pass`);
  }

  // ── Forms ─────────────────────────────────────────────────────────────────
  const forms = [
    ["Creative request intake", "https://forms.byteforce.test/creative-request", "BYTEFORCE", "Design team queue"],
    ["Campaign asset handover", "https://forms.byteforce.test/asset-handover", "BYTEFORCE", "Notes mention Nile Foods"],
    ["New client onboarding", "https://forms.byteforce.test/onboarding", "BYTEFORCE", "Sales fills this in on signature"],
    ["Support escalation", "https://forms.bsystems.test/escalation", "BSYSTEMS", "Routes to the on-call engineer"],
    ["Hardware request", "https://forms.bsystems.test/hardware", "BSYSTEMS", null],
    ["Leave request", "https://forms.bsystems.test/leave", "BSYSTEMS", "Goes to HR, not your manager"],
  ] as const;

  for (const [name, url, company, notes] of forms) {
    const exists = await db.form.findFirst({ where: { name } });
    if (!exists) {
      await db.form.create({ data: { name, url, company, notes, createdBy: "demo-seed" } });
    }
  }

  // One archived form, so the archive has something in it (AC-15).
  const archived = await db.form.findFirst({ where: { name: "Old creative brief (2025)" } });
  if (!archived) {
    await db.form.create({
      data: {
        name: "Old creative brief (2025)",
        url: "https://forms.byteforce.test/brief-2025",
        company: "BYTEFORCE",
        notes: "Replaced by the creative request intake",
        createdBy: "demo-seed",
        isArchived: true,
      },
    });
  }

  // ── Sheets ────────────────────────────────────────────────────────────────
  const sheets = [
    {
      name: "Nile Foods — campaign leads",
      type: "CAMPAIGN_LEADS" as const,
      company: "BYTEFORCE" as const,
      dateCreated: day("2026-06-02"),
      url: "https://docs.google.test/spreadsheets/nile-leads",
      lastRecordCount: 840,
      lastRecordCountAsOf: day("2026-08-09"),
      notes: "Updated by the media team each Monday",
    },
    {
      name: "Q3 inbound leads",
      type: "LEADS" as const,
      company: "BYTEFORCE" as const,
      dateCreated: day("2026-07-01"),
      url: "https://docs.google.test/spreadsheets/q3-inbound",
      lastRecordCount: 1240,
      lastRecordCountAsOf: day("2026-07-12"),
      notes: null,
    },
    {
      name: "Staff directory",
      type: "EMPLOYEES" as const,
      company: "BSYSTEMS" as const,
      dateCreated: day("2026-01-15"),
      url: "https://docs.google.test/spreadsheets/staff",
      lastRecordCount: 48,
      lastRecordCountAsOf: day("2026-08-01"),
      notes: "HR keeps this one current",
    },
    {
      name: "Server inventory",
      type: "DATA" as const,
      company: "BSYSTEMS" as const,
      dateCreated: day("2026-03-20"),
      url: "https://docs.google.test/spreadsheets/servers",
      lastRecordCount: null,
      lastRecordCountAsOf: null,
      notes: "Rack and warranty dates",
    },
  ];

  for (const s of sheets) {
    const exists = await db.sheet.findFirst({ where: { name: s.name } });
    if (!exists) {
      await db.sheet.create({
        data: { ...s, storageMode: "LINK", createdBy: "demo-seed" },
      });
    }
  }

  // ── Documents ─────────────────────────────────────────────────────────────
  /**
   * These write to object storage directly rather than through storeUpload(), because
   * the upload pipeline pulls in `file-type`, which is ESM-only and cannot be loaded
   * by tsx in this CommonJS project. That is a seeding constraint, not a shortcut in
   * the app: every real upload still runs the full pipeline, and content inspection is
   * covered by its own tests. The bytes below are genuine PDFs either way.
   */
  const { putObject } = await import("../src/server/files/storage");
  const { randomUUID } = await import("node:crypto");

  async function seedFile(scope: string, bytes: Buffer, filename: string, mimeType: string) {
    const storageKey = `${scope}s/${randomUUID()}`;
    await putObject(storageKey, bytes, mimeType);
    return db.storedFile.create({
      data: {
        originalFilename: filename,
        storageKey,
        mimeType,
        sizeBytes: bytes.byteLength,
        uploadedBy: admin!.id,
        scanStatus: "CLEAN",
      },
    });
  }

  /** A small but genuinely valid PDF, so content inspection accepts it (BR-04). */
  function pdfBytes(title: string) {
    const body = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >> endobj
4 0 obj << /Length ${title.length + 40} >> stream
BT /F1 18 Tf 60 760 Td (${title}) Tj ET
endstream endobj
trailer << /Root 1 0 R >>
%%EOF`;
    return Buffer.from(body, "latin1");
  }

  const documents = [
    ["Retainer agreement — Nile Foods", "CONTRACT", "BYTEFORCE", "Twelve months from 01 Aug 2026"],
    ["Nile Foods — media plan Q3", "PROPOSAL", "BYTEFORCE", "Search, social and creative split"],
    ["August invoice — Nile Foods", "INVOICE", "BYTEFORCE", null],
    ["Brand guidelines v4", "BRAND_ASSET", "BYTEFORCE", "Logo, type and colour rules"],
    ["Data processing agreement", "LEGAL", "BSYSTEMS", "Signed by both parties"],
    ["Q2 infrastructure review", "REPORT", "BSYSTEMS", "Uptime, incidents and capacity"],
  ] as const;

  for (const [name, type, company, description] of documents) {
    const exists = await db.document.findFirst({ where: { name } });
    if (exists) continue;
    const stored = await seedFile(
      "document",
      pdfBytes(name),
      `${name}.pdf`,
      "application/pdf",
    );
    await db.document.create({
      data: { name, type, company, description, fileId: stored.id, createdBy: "demo-seed" },
    });
  }

  // ── An uploaded sheet, so the computed record count is visible (AC-04) ─────
  if (!(await db.sheet.findFirst({ where: { name: "August campaign leads (upload)" } }))) {
    const { countCsv } = await import("../src/server/sheets/row-count");
    const { todayInCairo } = await import("../src/lib/datetime");
    const rows = [
      "name,email,score",
      ...Array.from({ length: 312 }, (_, i) => `Lead ${i},lead${i}@x.test,${i % 9}`),
    ];
    const bytes = Buffer.from(rows.join("\n"));
    const stored = await seedFile("sheet", bytes, "august-leads.csv", "text/csv");
    // Counted by the same function the upload path uses (FR-S05/AC-04).
    const counted = countCsv(bytes);
    await db.sheet.create({
      data: {
        name: "August campaign leads (upload)",
        storageMode: "FILE",
        fileId: stored.id,
        dateCreated: day("2026-08-01"),
        company: "BYTEFORCE",
        type: "CAMPAIGN_LEADS",
        lastRecordCount: counted.count,
        lastRecordCountAsOf: todayInCairo(),
        notes: "Counted from the file on upload",
        createdBy: "demo-seed",
      },
    });
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const [, karim, nour, omar, salma, youssef] = employees;

  const tasks: {
    employeeId: string;
    name: string;
    description: string | null;
    deadline: Date;
    company: "BYTEFORCE" | "BSYSTEMS" | null;
    complete?: { at: Date; result: string };
  }[] = [
    // Hana — one overdue, three open, two completed (one late, one on time)
    {
      employeeId: hana.id,
      name: "Rebuild Q3 lookalike audiences",
      description:
        "Refresh the source lists after the July purge, then rebuild all four lookalikes on both platforms.",
      deadline: daysFromNow(-3),
      company: "BYTEFORCE",
    },
    {
      employeeId: hana.id,
      name: "Draft the August paid social plan",
      description: "Budget split by platform, with the Ramadan calendar accounted for.",
      deadline: daysFromNow(1),
      company: "BYTEFORCE",
    },
    {
      employeeId: hana.id,
      name: "Audit landing page tracking",
      description: "Check every event fires once, on both the old and new templates.",
      deadline: daysFromNow(8),
      company: "BYTEFORCE",
    },
    {
      employeeId: hana.id,
      name: "July performance report",
      description: "Full month across paid search and social.",
      deadline: daysFromNow(-11),
      company: "BYTEFORCE",
      complete: {
        at: daysFromNow(-11),
        result: "Sent to the client and walked through on the Thursday call.",
      },
    },
    {
      employeeId: hana.id,
      name: "Renew the ad account billing",
      description: "Card on file expired on 31 July.",
      deadline: daysFromNow(-19),
      company: "BYTEFORCE",
      complete: { at: daysFromNow(-16), result: "New company card added, receipt attached." },
    },
    // Others
    {
      employeeId: karim!.id,
      name: "Nile Foods creative review",
      description: "Second round after the client's notes.",
      deadline: daysFromNow(4),
      company: "BYTEFORCE",
    },
    {
      employeeId: karim!.id,
      name: "Refresh the brand asset pack",
      description: null,
      deadline: daysFromNow(12),
      company: "BYTEFORCE",
    },
    {
      employeeId: nour!.id,
      name: "Send the Nile Foods reporting pack",
      description: "Monthly pack, due before the review call.",
      deadline: daysFromNow(3),
      company: null,
    },
    {
      employeeId: nour!.id,
      name: "Chase the signed retainer",
      description: "Legal returned it with two edits.",
      deadline: daysFromNow(-2),
      company: null,
    },
    {
      employeeId: omar!.id,
      name: "Patch the staging servers",
      description: "Security updates, then confirm the monitoring is still green.",
      deadline: daysFromNow(6),
      company: "BSYSTEMS",
    },
    {
      employeeId: salma!.id,
      name: "Rewrite the onboarding emails",
      description: "Three emails, plainer language, same sequence.",
      deadline: daysFromNow(-1),
      company: "BYTEFORCE",
    },
    {
      employeeId: youssef!.id,
      name: "Reconcile August media spend",
      description: null,
      deadline: daysFromNow(9),
      company: "BSYSTEMS",
    },
  ];

  for (const spec of tasks) {
    const exists = await db.task.findFirst({
      where: { name: spec.name, employeeId: spec.employeeId },
    });
    if (exists) continue;

    const task = await db.task.create({
      data: {
        employeeId: spec.employeeId,
        name: spec.name,
        description: spec.description,
        company: spec.company,
        deadline: spec.deadline,
        createdBy: admin.id,
      },
    });

    if (spec.complete) {
      // Written the way the real path writes it: lateness computed from the deadline
      // and the completion instant, then stored (BR-07).
      const { computeLateness } = await import("../src/server/tasks/lateness");
      const { wasLate, daysLate } = computeLateness(spec.deadline, spec.complete.at);
      await db.task.update({
        where: { id: task.id },
        data: {
          status: "COMPLETED",
          resultText: spec.complete.result,
          completedAt: spec.complete.at,
          wasLate,
          daysLate,
        },
      });
      await db.activityLog.create({
        data: {
          actorId: admin.id,
          entityType: "task",
          entityId: task.id,
          action: "complete",
          meta: { wasLate, daysLate, seeded: true },
        },
      });
    }
  }

  const counts = {
    employees: await db.employee.count(),
    forms: await db.form.count({ where: { isArchived: false } }),
    sheets: await db.sheet.count({ where: { isArchived: false } }),
    documents: await db.document.count({ where: { isArchived: false } }),
    tasks: await db.task.count(),
  };
  console.log("demo content ready:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
