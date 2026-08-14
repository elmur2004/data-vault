import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { completeTask, reopenTask, saveResult } from "@/server/tasks/complete";
import { createTask, getTask, listEmployeeCards, listTasks, updateTask } from "@/server/tasks/service";
import { taskListParams } from "@/lib/validation/task";
import type { SessionUser } from "@/server/auth/guards";
import { storeUpload } from "@/server/files/service";

/**
 * M6 â€” the invariants the whole product exists for.
 *
 * BR-05 the completion gate Â· BR-06 server-stamped completion Â· BR-07 frozen lateness Â·
 * BR-08 admin-only reopen Â· BR-09 employee scoping.
 * Proves AC-07's server half, AC-08, AC-09, AC-12, AC-13 and AC-14 at the service
 * layer; the same criteria are re-run over HTTP in M9.
 */

const db = new PrismaClient();
const tag = `k${Date.now().toString(36)}`;

let adminUser: SessionUser;
let employeeUser: SessionUser;
let employeeId = "";
let otherEmployeeId = "";

const dayOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const params = (over: Record<string, unknown> = {}) => taskListParams.parse(over);

async function makeTask(over: Partial<{ name: string; deadline: Date; employeeId: string }> = {}) {
  return createTask(adminUser.id, {
    employeeId: over.employeeId ?? employeeId,
    name: over.name ?? `${tag} task`,
    description: null,
    company: null,
    deadline: over.deadline ?? dayOf("2026-08-10"),
  });
}

beforeAll(async () => {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Run `npm run db:seed` first.");
  adminUser = { id: admin.id, name: admin.name, email: admin.email, role: "ADMIN", employeeId: null };

  // Two employees, so cross-employee access has something real to be refused.
  const mine = await db.employee.create({
    data: { fullName: `${tag} Mine`, email: `${tag}-mine@x.test` },
  });
  const theirs = await db.employee.create({
    data: { fullName: `${tag} Theirs`, email: `${tag}-theirs@x.test` },
  });
  employeeId = mine.id;
  otherEmployeeId = theirs.id;

  employeeUser = {
    id: `${tag}-user-mine`,
    name: "Mine",
    email: `${tag}-mine@x.test`,
    role: "EMPLOYEE",
    employeeId: mine.id,
  };
});

afterAll(async () => {
  await db.taskAttachment.deleteMany({ where: { task: { name: { contains: tag } } } });
  await db.task.deleteMany({ where: { name: { contains: tag } } });
  await db.employee.deleteMany({ where: { email: { contains: tag } } });
  await db.$disconnect();
});

describe("BR-05 / AC-08 â€” the completion gate", () => {
  it("refuses to complete a task with no result at all", async () => {
    const task = await makeTask({ name: `${tag} no result` });

    await expect(completeTask(employeeUser, task.id)).rejects.toMatchObject({
      status: 422,
      code: "RESULT_REQUIRED",
    });

    // And the task is still open â€” nothing was half-committed.
    const after = await db.task.findUnique({ where: { id: task.id } });
    expect(after?.status).toBe("OPEN");
    expect(after?.completedAt).toBeNull();
  });

  it("refuses when the client sends only whitespace as the result", async () => {
    const task = await makeTask({ name: `${tag} whitespace` });
    await expect(
      completeTask(employeeUser, task.id, { resultText: "   \n\t " }),
    ).rejects.toMatchObject({ code: "RESULT_REQUIRED" });
    expect((await db.task.findUnique({ where: { id: task.id } }))?.status).toBe("OPEN");
  });

  it("accepts result text alone", async () => {
    const task = await makeTask({ name: `${tag} text only` });
    const done = await completeTask(employeeUser, task.id, { resultText: "Sent to the client." });
    expect(done.status).toBe("COMPLETED");
    expect(done.resultText).toBe("Sent to the client.");
  });

  it("AC-09 â€” accepts an uploaded file alone, with no text", async () => {
    const task = await makeTask({ name: `${tag} file only` });
    const { file } = await storeUpload({
      scope: "attachment",
      file: new File([new Uint8Array(Buffer.from("%PDF-1.7\n%%EOF\n"))], "result.pdf"),
      uploadedBy: adminUser.id,
    });

    const done = await completeTask(employeeUser, task.id, { fileIds: [file.id] });
    expect(done.status).toBe("COMPLETED");
    // Never required text alongside an attachment â€” no "see attached" theatre (Â§9.3).
    expect(done.resultText).toBeNull();
  });

  it("accepts a link alone", async () => {
    const task = await makeTask({ name: `${tag} link only` });
    const done = await completeTask(employeeUser, task.id, {
      links: [{ url: "https://drive.test/report", label: "Report" }],
    });
    expect(done.status).toBe("COMPLETED");

    const attachments = await db.taskAttachment.findMany({ where: { taskId: task.id } });
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.kind).toBe("LINK");
  });

  it("Â§9.3 â€” saving the result and completing is one action, not two", async () => {
    const task = await makeTask({ name: `${tag} one action` });
    // A single call carries the result and completes; the task was resultless before.
    const done = await completeTask(employeeUser, task.id, { resultText: "Done in one step." });
    expect(done.status).toBe("COMPLETED");
    expect(done.completedAt).not.toBeNull();
  });

  it("a rejected completion commits nothing â€” no orphaned attachments", async () => {
    const task = await makeTask({ name: `${tag} rollback` });
    await expect(completeTask(employeeUser, task.id, { resultText: "" })).rejects.toThrow();
    const attachments = await db.taskAttachment.count({ where: { taskId: task.id } });
    expect(attachments).toBe(0);
  });

  it("refuses to complete an already completed task", async () => {
    const task = await makeTask({ name: `${tag} twice` });
    await completeTask(employeeUser, task.id, { resultText: "first" });
    await expect(completeTask(employeeUser, task.id, { resultText: "second" })).rejects.toMatchObject(
      { code: "TASK_NOT_OPEN" },
    );
  });
});

describe("BR-06 / BR-07 â€” completion time and lateness", () => {
  it("stamps completedAt from server time, not from any client input", async () => {
    const task = await makeTask({ name: `${tag} server time` });
    const before = Date.now();
    const done = await completeTask(employeeUser, task.id, { resultText: "ok" });
    const after = Date.now();

    expect(done.completedAt).not.toBeNull();
    const stamped = done.completedAt!.getTime();
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped).toBeLessThanOrEqual(after + 1000);
  });

  it("stores lateness rather than deriving it", async () => {
    // Deadline well in the past, so completing now is definitively late.
    const task = await makeTask({ name: `${tag} late`, deadline: dayOf("2020-01-01") });
    const done = await completeTask(employeeUser, task.id, { resultText: "late but done" });

    expect(done.wasLate).toBe(true);
    expect(done.daysLate).toBeGreaterThan(0);

    // The columns are populated, not computed on read.
    const raw = await db.task.findUnique({
      where: { id: task.id },
      select: { wasLate: true, daysLate: true },
    });
    expect(raw?.wasLate).toBe(true);
    expect(typeof raw?.daysLate).toBe("number");
  });

  it("a task completed before its deadline is on time", async () => {
    const future = new Date(Date.now() + 30 * 86400000);
    const task = await makeTask({
      name: `${tag} early`,
      deadline: dayOf(future.toISOString().slice(0, 10)),
    });
    const done = await completeTask(employeeUser, task.id, { resultText: "early" });
    expect(done.wasLate).toBe(false);
    expect(done.daysLate).toBe(0);
  });

  it("AC-12 â€” editing the deadline afterwards does not alter the stored lateness", async () => {
    const task = await makeTask({ name: `${tag} frozen`, deadline: dayOf("2020-01-01") });
    const done = await completeTask(employeeUser, task.id, { resultText: "done" });

    const recordedLate = done.wasLate;
    const recordedDays = done.daysLate;
    expect(recordedLate).toBe(true);

    // An admin moves the deadline to something generous, long after completion.
    await updateTask(adminUser.id, task.id, {
      employeeId,
      name: `${tag} frozen`,
      description: null,
      company: null,
      deadline: dayOf("2030-01-01"),
    });

    const after = await db.task.findUnique({ where: { id: task.id } });
    expect(after?.deadline.toISOString().slice(0, 10)).toBe("2030-01-01");
    // What was true at completion stays true.
    expect(after?.wasLate).toBe(recordedLate);
    expect(after?.daysLate).toBe(recordedDays);
    expect(after?.completedAt?.getTime()).toBe(done.completedAt?.getTime());
  });
});

describe("BR-09 / AC-13 â€” employees see and touch only their own tasks", () => {
  it("another employee's task is not in the list payload", async () => {
    await makeTask({ name: `${tag} mine visible` });
    await makeTask({ name: `${tag} theirs hidden`, employeeId: otherEmployeeId });

    const mine = await listTasks(employeeUser, params({ q: tag }));
    expect(mine.rows.length).toBeGreaterThan(0);
    expect(mine.rows.every((t) => t.employeeId === employeeId)).toBe(true);
    // Not merely hidden in the UI â€” absent from the data entirely.
    expect(JSON.stringify(mine.rows)).not.toContain("theirs hidden");
  });

  it("fetching another employee's task is refused", async () => {
    const theirs = await makeTask({ name: `${tag} not yours`, employeeId: otherEmployeeId });
    await expect(getTask(employeeUser, theirs.id)).rejects.toMatchObject({ status: 403 });
  });

  it("completing another employee's task is refused", async () => {
    const theirs = await makeTask({ name: `${tag} not yours 2`, employeeId: otherEmployeeId });
    await expect(
      completeTask(employeeUser, theirs.id, { resultText: "sneaky" }),
    ).rejects.toMatchObject({ status: 403 });

    expect((await db.task.findUnique({ where: { id: theirs.id } }))?.status).toBe("OPEN");
  });

  it("adding a result to another employee's task is refused", async () => {
    const theirs = await makeTask({ name: `${tag} not yours 3`, employeeId: otherEmployeeId });
    await expect(
      saveResult(employeeUser, theirs.id, { resultText: "sneaky" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("asking for another employee's card by id is refused", async () => {
    await expect(
      listTasks(employeeUser, params({ employeeId: otherEmployeeId })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("an admin sees every employee's tasks", async () => {
    const all = await listTasks(adminUser, params({ q: tag }));
    const employees = new Set(all.rows.map((t) => t.employeeId));
    expect(employees.size).toBeGreaterThan(1);
  });

  it("Â§9.1 â€” an employee's card list contains only their own card", async () => {
    const cards = await listEmployeeCards(employeeUser);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe(employeeId);

    const adminCards = await listEmployeeCards(adminUser);
    expect(adminCards.length).toBeGreaterThan(1);
  });

  it("DF-06 â€” an account with no employee record sees nothing, never everything", async () => {
    const orphan: SessionUser = {
      id: "orphan",
      name: "Orphan",
      email: "orphan@x.test",
      role: "EMPLOYEE",
      employeeId: null,
    };
    const res = await listTasks(orphan, params({ q: tag }));
    expect(res.rows).toHaveLength(0);
    expect(await listEmployeeCards(orphan)).toHaveLength(0);
  });
});

describe("BR-08 / AC-14 â€” only admins reopen", () => {
  it("an employee cannot reopen their own completed task", async () => {
    const task = await makeTask({ name: `${tag} reopen mine` });
    await completeTask(employeeUser, task.id, { resultText: "done" });

    await expect(reopenTask(employeeUser, task.id)).rejects.toMatchObject({ status: 403 });
    expect((await db.task.findUnique({ where: { id: task.id } }))?.status).toBe("COMPLETED");
  });

  it("an admin reopens it, clearing the completion fields and keeping the result", async () => {
    const task = await makeTask({ name: `${tag} reopen admin`, deadline: dayOf("2020-01-01") });
    const done = await completeTask(employeeUser, task.id, { resultText: "the result survives" });
    expect(done.wasLate).toBe(true);

    const reopened = await reopenTask(adminUser, task.id);
    expect(reopened.status).toBe("OPEN");
    expect(reopened.completedAt).toBeNull();
    expect(reopened.wasLate).toBeNull();
    expect(reopened.daysLate).toBeNull();
    // Â§9.5 â€” the result text and attachments remain.
    expect(reopened.resultText).toBe("the result survives");
  });

  it("Â§9.5 â€” reopening records the previous values in the audit trail", async () => {
    const task = await makeTask({ name: `${tag} reopen audit`, deadline: dayOf("2020-01-01") });
    const done = await completeTask(employeeUser, task.id, { resultText: "x" });
    await reopenTask(adminUser, task.id);

    const entry = await db.activityLog.findFirst({
      where: { entityType: "task", entityId: task.id, action: "reopen" },
    });
    expect(entry).not.toBeNull();
    const meta = JSON.stringify(entry?.meta);
    expect(meta).toContain(String(done.daysLate));
    expect(meta).toContain("wasLate");
  });

  it("cannot reopen a task that is still open", async () => {
    const task = await makeTask({ name: `${tag} reopen open` });
    await expect(reopenTask(adminUser, task.id)).rejects.toMatchObject({ code: "TASK_NOT_OPEN" });
  });
});

describe("Â§9.2 / FR-T09 â€” ordering and the live overdue flag", () => {
  it("sorts open tasks first, then by deadline ascending", async () => {
    const t1 = await makeTask({ name: `${tag} sort late`, deadline: dayOf("2027-12-01") });
    const t2 = await makeTask({ name: `${tag} sort soon`, deadline: dayOf("2027-01-01") });
    const t3 = await makeTask({ name: `${tag} sort done`, deadline: dayOf("2026-01-01") });
    await completeTask(employeeUser, t3.id, { resultText: "done" });

    const list = await listTasks(employeeUser, params({ q: `${tag} sort` }));
    const ids = list.rows.map((r) => r.id);
    // Open ones first, nearest deadline on top; the completed one sinks to the bottom.
    expect(ids.indexOf(t2.id)).toBeLessThan(ids.indexOf(t1.id));
    expect(ids.indexOf(t1.id)).toBeLessThan(ids.indexOf(t3.id));
  });

  it("flags an open task past its deadline as overdue, and never a completed one", async () => {
    const overdue = await makeTask({ name: `${tag} overdue`, deadline: dayOf("2020-01-01") });
    const completedLate = await makeTask({ name: `${tag} was late`, deadline: dayOf("2020-01-01") });
    await completeTask(employeeUser, completedLate.id, { resultText: "done" });

    const list = await listTasks(employeeUser, params({ q: tag }));
    expect(list.rows.find((r) => r.id === overdue.id)?.isOverdue).toBe(true);
    // A completed task is never "overdue" â€” that is history (wasLate), not a warning.
    expect(list.rows.find((r) => r.id === completedLate.id)?.isOverdue).toBe(false);
  });

  it("counts open, overdue and completed on the card", async () => {
    const cards = await listEmployeeCards(employeeUser);
    const card = cards[0]!;
    expect(card.openCount).toBeGreaterThan(0);
    expect(card.overdueCount).toBeGreaterThan(0);
    expect(card.completedCount).toBeGreaterThan(0);
  });

  it("FR-T13 â€” filters by status and by overdue", async () => {
    const open = await listTasks(employeeUser, params({ q: tag, status: "OPEN" }));
    expect(open.rows.every((r) => r.status === "OPEN")).toBe(true);

    const overdue = await listTasks(employeeUser, params({ q: tag, overdue: true }));
    expect(overdue.rows.every((r) => r.isOverdue)).toBe(true);
  });
});

describe("FR-T12 â€” reassignment is logged", () => {
  it("records the move from one employee to another", async () => {
    const task = await makeTask({ name: `${tag} reassign` });
    await updateTask(adminUser.id, task.id, {
      employeeId: otherEmployeeId,
      name: `${tag} reassign`,
      description: null,
      company: null,
      deadline: dayOf("2026-08-10"),
    });

    const entry = await db.activityLog.findFirst({
      where: { entityType: "task", entityId: task.id, action: "reassign" },
    });
    expect(entry).not.toBeNull();
    const meta = JSON.stringify(entry?.meta);
    expect(meta).toContain(employeeId);
    expect(meta).toContain(otherEmployeeId);
  });
});
