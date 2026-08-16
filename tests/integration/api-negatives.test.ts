import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
// The app's own client, so service calls here run through exactly what production runs.
import { db } from "@/lib/db";
import { createEmployee } from "@/server/employees/service";
import { issueInvitation } from "@/server/employees/invitations";
import { setPasswordFromToken } from "@/server/auth/activate";
import { createTask } from "@/server/tasks/service";
import { completeTask } from "@/server/tasks/complete";
import { hashPassword } from "@/lib/password";

/**
 * The direct-API negative tests.
 *
 * docs/ACCEPTANCE.md: "The negative tests marked **API** must be sent directly to the
 * endpoint, not through the UI, because the UI hides the button â€” the server must still
 * refuse." These assert the actual HTTP status codes over the wire, with real session
 * cookies, against the running dev server.
 *
 * Requires `npm run dev`. Skips (loudly) rather than silently passing if it is down.
 */

const BASE = process.env.VAULT_BASE_URL ?? "http://localhost:3001";
const tag = `n${Date.now().toString(36)}`;

let serverUp = false;
let adminCookie = "";
let employeeCookie = "";
let myTaskId = "";
let otherTaskId = "";
let completedTaskId = "";
let myEmployeeId = "";

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Better Auth rejects state-changing requests without an Origin (CSRF
      // protection). A browser always sends one; a raw fetch has to say so too.
      origin: BASE,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(
      `sign-in failed for ${email}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`,
    );
  }

  // getSetCookie() is the correct API but is not guaranteed everywhere; fall back to
  // the concatenated header rather than silently returning no cookie at all.
  const list = res.headers.getSetCookie?.() ?? [];
  const raw = list.length ? list : [res.headers.get("set-cookie") ?? ""];
  const cookie = raw
    .filter(Boolean)
    .map((c) => c.split(";")[0]!.trim())
    .join("; ");
  if (!cookie) throw new Error(`sign-in returned no session cookie for ${email}`);
  return cookie;
}

/**
 * A self-contained admin, so these tests never depend on knowing the seeded admin's
 * one-time password.
 */
async function makeSignedInAdmin() {
  const email = `${tag}-admin@x.test`;
  const password = `${randomBytes(12).toString("base64url")}Aa1`;
  const user = await db.user.create({
    data: { name: `${tag} admin`, email, emailVerified: true, role: "ADMIN" },
  });
  await db.account.create({
    data: {
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: await hashPassword(password),
    },
  });
  return { user, email, password };
}

/** Creates an employee and walks the real activation flow to get a usable account. */
async function makeSignedInEmployee(adminId: string, label: string) {
  const email = `${tag}-${label}@x.test`;
  const password = `${randomBytes(12).toString("base64url")}Aa1`;
  const { employee } = await createEmployee(adminId, {
    fullName: `${tag} ${label}`,
    email,
    jobTitle: null,
    company: null,
  });
  const { raw } = await issueInvitation(db, employee.id, "ACTIVATION");
  await setPasswordFromToken(raw, password);
  return { employee, email, password };
}

beforeAll(async () => {
  try {
    const ping = await fetch(`${BASE}/login`, { redirect: "manual" });
    serverUp = ping.status < 500;
  } catch {
    serverUp = false;
  }
  if (!serverUp) return;

  const admin = await makeSignedInAdmin();
  adminCookie = await signIn(admin.email, admin.password);

  const mine = await makeSignedInEmployee(admin.user.id, "mine");
  const theirs = await makeSignedInEmployee(admin.user.id, "theirs");
  myEmployeeId = mine.employee.id;
  employeeCookie = await signIn(mine.email, mine.password);

  const deadline = new Date(Date.UTC(2026, 7, 10));
  myTaskId = (await createTask(admin.user.id, {
    employeeId: mine.employee.id,
    name: `${tag} mine`,
    description: null,
    company: null,
    deadline,
  })).id;

  otherTaskId = (await createTask(admin.user.id, {
    employeeId: theirs.employee.id,
    name: `${tag} theirs`,
    description: null,
    company: null,
    deadline,
  })).id;

  const done = await createTask(admin.user.id, {
    employeeId: mine.employee.id,
    name: `${tag} done`,
    description: null,
    company: null,
    deadline,
  });
  await completeTask(
    { id: "seed", name: "", email: "", role: "ADMIN", employeeId: null },
    done.id,
    { resultText: "already done" },
  );
  completedTaskId = done.id;
});

afterAll(async () => {
  await db.task.deleteMany({ where: { name: { contains: tag } } });
  await db.invitation.deleteMany({ where: { employee: { email: { contains: tag } } } });
  const emps = await db.employee.findMany({ where: { email: { contains: tag } }, select: { userId: true } });
  await db.employee.deleteMany({ where: { email: { contains: tag } } });
  for (const e of emps) if (e.userId) await db.user.delete({ where: { id: e.userId } }).catch(() => {});
  // The throwaway admin this suite creates has no Employee row, so it has to be
  // removed explicitly — otherwise every run leaves another ADMIN behind.
  await db.user.deleteMany({ where: { email: { contains: tag } } });
  await db.$disconnect();
});

describe("AC-08 â€” the completion gate, server side", () => {
  it("POSTing a completion for a resultless task returns 422 and leaves it open", async () => {
    expect(serverUp, "dev server must be running").toBe(true);

    const res = await fetch(`${BASE}/api/tasks/${myTaskId}/complete`, {
      method: "POST",
      headers: { cookie: employeeCookie, "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("RESULT_REQUIRED");

    const after = await db.task.findUnique({ where: { id: myTaskId } });
    expect(after?.status).toBe("OPEN");
    expect(after?.completedAt).toBeNull();
  });

  it("still 422 when the client sends whitespace pretending to be a result", async () => {
    const res = await fetch(`${BASE}/api/tasks/${myTaskId}/complete`, {
      method: "POST",
      headers: { cookie: employeeCookie, "content-type": "application/json" },
      body: JSON.stringify({ resultText: "     " }),
    });
    expect(res.status).toBe(422);
    expect((await db.task.findUnique({ where: { id: myTaskId } }))?.status).toBe("OPEN");
  });

  it("AC-09 â€” the same endpoint accepts a genuine result", async () => {
    const res = await fetch(`${BASE}/api/tasks/${myTaskId}/complete`, {
      method: "POST",
      headers: { cookie: employeeCookie, "content-type": "application/json" },
      body: JSON.stringify({ resultText: "Filed with the client." }),
    });
    expect(res.status).toBe(200);
    expect((await db.task.findUnique({ where: { id: myTaskId } }))?.status).toBe("COMPLETED");
  });
});

describe("AC-13 â€” employee scoping over HTTP", () => {
  it("a direct request for another employee's task returns 403", async () => {
    const res = await fetch(`${BASE}/api/tasks/${otherTaskId}`, {
      headers: { cookie: employeeCookie },
    });
    expect(res.status).toBe(403);
  });

  it("completing another employee's task returns 403 and changes nothing", async () => {
    const res = await fetch(`${BASE}/api/tasks/${otherTaskId}/complete`, {
      method: "POST",
      headers: { cookie: employeeCookie, "content-type": "application/json" },
      body: JSON.stringify({ resultText: "not mine to finish" }),
    });
    expect(res.status).toBe(403);
    expect((await db.task.findUnique({ where: { id: otherTaskId } }))?.status).toBe("OPEN");
  });

  it("the list endpoint returns only the employee's own tasks in the payload", async () => {
    const res = await fetch(`${BASE}/api/tasks?perPage=200`, { headers: { cookie: employeeCookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { employeeId: string }[] };
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.rows.every((r) => r.employeeId === myEmployeeId)).toBe(true);
    // Absent from the payload entirely, not merely hidden by the UI.
    expect(JSON.stringify(body)).not.toContain(otherTaskId);
  });

  it("search does not leak another employee's task either (R-2)", async () => {
    const res = await fetch(`${BASE}/api/search?q=${tag}`, { headers: { cookie: employeeCookie } });
    const body = await res.text();
    expect(body).not.toContain(otherTaskId);
  });
});

describe("AC-14 â€” only admins reopen", () => {
  it("an employee reopening their own completed task returns 403", async () => {
    const res = await fetch(`${BASE}/api/tasks/${completedTaskId}/reopen`, {
      method: "POST",
      headers: { cookie: employeeCookie },
    });
    expect(res.status).toBe(403);
    expect((await db.task.findUnique({ where: { id: completedTaskId } }))?.status).toBe("COMPLETED");
  });

  it("an admin reopening it succeeds", async () => {
    const res = await fetch(`${BASE}/api/tasks/${completedTaskId}/reopen`, {
      method: "POST",
      headers: { cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    expect((await db.task.findUnique({ where: { id: completedTaskId } }))?.status).toBe("OPEN");
  });
});

describe("BR-10 â€” employees cannot write to Forms, Sheets or Documents", () => {
  it("POSTing a form as an employee returns 403", async () => {
    const res = await fetch(`${BASE}/api/forms`, {
      method: "POST",
      headers: { cookie: employeeCookie, "content-type": "application/json" },
      body: JSON.stringify({
        name: `${tag} sneaky`,
        url: "https://x.test/sneaky",
        company: "BYTEFORCE",
      }),
    });
    expect(res.status).toBe(403);
    expect(await db.form.count({ where: { name: { contains: tag } } })).toBe(0);
  });

  it("creating a task as an employee returns 403", async () => {
    const res = await fetch(`${BASE}/api/tasks`, {
      method: "POST",
      headers: { cookie: employeeCookie, "content-type": "application/json" },
      body: JSON.stringify({
        employeeId: myEmployeeId,
        name: `${tag} self-assigned`,
        deadline: "2026-09-01",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("archiving a form as an employee returns 403", async () => {
    const form = await db.form.create({
      data: {
        name: `${tag} target`,
        url: "https://x.test/target",
        company: "BYTEFORCE",
        createdBy: "seed",
      },
    });
    const res = await fetch(`${BASE}/api/forms/${form.id}`, {
      method: "DELETE",
      headers: { cookie: employeeCookie },
    });
    expect(res.status).toBe(403);
    expect((await db.form.findUnique({ where: { id: form.id } }))?.isArchived).toBe(false);
  });
});

describe("AC-05 / NFR-07 â€” unauthenticated access", () => {
  it("the file download route refuses an anonymous request", async () => {
    const file = await db.storedFile.findFirst();
    if (!file) return;
    const res = await fetch(`${BASE}/api/files/${file.id}`, { redirect: "manual" });
    expect([401, 403, 307]).toContain(res.status);
    // Whatever it does, it must not hand over a signed URL.
    expect(res.headers.get("location") ?? "").not.toContain("X-Amz-Signature");
  });

  it("the tasks API refuses an anonymous request", async () => {
    const res = await fetch(`${BASE}/api/tasks`, { redirect: "manual" });
    expect(res.status).not.toBe(200);
  });

  it("the cron endpoint refuses a request without the shared secret", async () => {
    const res = await fetch(`${BASE}/api/cron/deadline-reminders`);
    expect(res.status).toBe(403);
  });
});
