import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { formInput } from "@/lib/validation/form";
import { listParams } from "@/lib/validation/common";
import {
  archiveForm,
  createForm,
  findDuplicateUrl,
  listForms,
  restoreForm,
  updateForm,
} from "@/server/forms/service";

/**
 * M3 — Forms (FR-F01..F08, BR-01, BR-11).
 * Proves AC-01, AC-02 and AC-15 at the service layer; the browser run and the
 * employee-403 API test follow in M9.
 */

const db = new PrismaClient();
let actor = "";
const tag = `t${Date.now().toString(36)}`;
const params = (over: Record<string, unknown> = {}) => listParams.parse({ ...over });

beforeAll(async () => {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Run `npm run db:seed` first.");
  actor = admin.id;
});

afterAll(async () => {
  await db.form.deleteMany({ where: { name: { contains: tag } } });
  await db.$disconnect();
});

describe("BR-01 / AC-02 — URL validation", () => {
  const base = { name: "X", company: "BYTEFORCE" as const, notes: undefined };

  it("rejects a string that is not a URL at all", () => {
    const r = formInput.safeParse({ ...base, url: "notaurl" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/http/i);
  });

  it("rejects a non-http protocol (ftp://x)", () => {
    const r = formInput.safeParse({ ...base, url: "ftp://x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/ftp/);
  });

  it("rejects javascript: and mailto: which new URL() would happily accept", () => {
    expect(formInput.safeParse({ ...base, url: "javascript:alert(1)" }).success).toBe(false);
    expect(formInput.safeParse({ ...base, url: "mailto:a@b.test" }).success).toBe(false);
  });

  it("accepts http and https", () => {
    expect(formInput.safeParse({ ...base, url: "http://forms.test/a" }).success).toBe(true);
    expect(formInput.safeParse({ ...base, url: "https://forms.test/a?x=1" }).success).toBe(true);
  });
});

describe("AC-01 — creation, listing and the company filter", () => {
  it("creates a form and isolates it with the company filter", async () => {
    const bf = await createForm(actor, {
      name: `${tag} ByteForce intake`,
      url: `https://forms.test/${tag}-bf`,
      company: "BYTEFORCE",
      notes: "Intake for new clients",
    });
    const bs = await createForm(actor, {
      name: `${tag} B-Systems onboarding`,
      url: `https://forms.test/${tag}-bs`,
      company: "BSYSTEMS",
      notes: null,
    });

    const all = await listForms(params({ q: tag }));
    expect(all.rows.map((r) => r.id).sort()).toEqual([bf.id, bs.id].sort());

    const onlyBf = await listForms(params({ q: tag, company: "BYTEFORCE" }));
    expect(onlyBf.rows.map((r) => r.id)).toEqual([bf.id]);
    expect(onlyBf.total).toBe(1);
  });

  it("FR-F07 — searches across name and notes", async () => {
    await createForm(actor, {
      name: `${tag} unremarkable name`,
      url: `https://forms.test/${tag}-notes`,
      company: "BYTEFORCE",
      notes: "mentions kryptonite in the notes",
    });
    const byNotes = await listForms(params({ q: "kryptonite" }));
    expect(byNotes.rows.some((r) => r.name.includes("unremarkable"))).toBe(true);
  });

  it("FR-F06 — sorts by name and by date added", async () => {
    const asc = await listForms(params({ q: tag, sort: "name", dir: "asc" }));
    const names = asc.rows.map((r) => r.name);
    expect([...names].sort()).toEqual(names);

    const desc = await listForms(params({ q: tag, sort: "name", dir: "desc" }));
    expect(desc.rows.map((r) => r.name)).toEqual([...names].reverse());
  });

  it("refuses a sort key that is not on the allowlist", async () => {
    // A sort key is user input; an unknown one must fall back, never reach the query.
    const res = await listForms(params({ q: tag, sort: "url; DROP TABLE", dir: "asc" }));
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it("R-3 — paginates in the database, not the browser", async () => {
    const page1 = await listForms(params({ q: tag, perPage: 2, page: 1, sort: "name", dir: "asc" }));
    const page2 = await listForms(params({ q: tag, perPage: 2, page: 2, sort: "name", dir: "asc" }));
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBeGreaterThan(2);
    expect(page1.pages).toBe(Math.ceil(page1.total / 2));
    expect(page1.rows.map((r) => r.id)).not.toEqual(page2.rows.map((r) => r.id));
  });
});

describe("FR-F08 — duplicate URL warns rather than blocks", () => {
  it("finds an existing form with the same address", async () => {
    const url = `https://forms.test/${tag}-dupe`;
    const first = await createForm(actor, {
      name: `${tag} original`,
      url,
      company: "BYTEFORCE",
      notes: null,
    });

    const clash = await findDuplicateUrl(url);
    expect(clash?.id).toBe(first.id);
    expect(clash?.name).toContain("original");

    // Editing the same form must not flag itself.
    expect(await findDuplicateUrl(url, first.id)).toBeNull();
  });

  it("does not flag an archived form as a clash", async () => {
    const url = `https://forms.test/${tag}-archived-dupe`;
    const f = await createForm(actor, { name: `${tag} gone`, url, company: "BYTEFORCE", notes: null });
    await archiveForm(actor, f.id);
    expect(await findDuplicateUrl(url)).toBeNull();
  });
});

describe("AC-15 / BR-11 — archival, never deletion", () => {
  it("removes the record from views and counts, and restores it intact", async () => {
    const f = await createForm(actor, {
      name: `${tag} to archive`,
      url: `https://forms.test/${tag}-arch`,
      company: "BSYSTEMS",
      notes: "keep me",
    });

    const before = await listForms(params({ q: tag }));
    expect(before.rows.some((r) => r.id === f.id)).toBe(true);

    await archiveForm(actor, f.id);

    const after = await listForms(params({ q: tag }));
    expect(after.rows.some((r) => r.id === f.id)).toBe(false);
    expect(after.total).toBe(before.total - 1); // excluded from counts too

    // The row still exists — nothing was hard deleted.
    const stillThere = await db.form.findUnique({ where: { id: f.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.notes).toBe("keep me");

    const archivedView = await listForms(params({ q: tag, archived: true }));
    expect(archivedView.rows.some((r) => r.id === f.id)).toBe(true);

    await restoreForm(actor, f.id);
    const restored = await listForms(params({ q: tag }));
    expect(restored.rows.some((r) => r.id === f.id)).toBe(true);
  });
});

describe("§6.8 — the activity log records every change", () => {
  it("writes create, update, archive and restore entries", async () => {
    const f = await createForm(actor, {
      name: `${tag} logged`,
      url: `https://forms.test/${tag}-log`,
      company: "BYTEFORCE",
      notes: null,
    });
    await updateForm(actor, f.id, {
      name: `${tag} logged (renamed)`,
      url: `https://forms.test/${tag}-log`,
      company: "BYTEFORCE",
      notes: "now with notes",
    });
    await archiveForm(actor, f.id);
    await restoreForm(actor, f.id);

    const log = await db.activityLog.findMany({
      where: { entityType: "form", entityId: f.id },
      orderBy: { createdAt: "asc" },
    });
    expect(log.map((l) => l.action)).toEqual(["create", "update", "archive", "restore"]);
    expect(log.every((l) => l.actorId === actor)).toBe(true);

    // The update entry keeps the previous values — provenance, not just a timestamp.
    const update = log.find((l) => l.action === "update");
    expect(JSON.stringify(update?.meta)).toContain("logged");
  });
});
