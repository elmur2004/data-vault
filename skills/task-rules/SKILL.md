---
name: task-rules
description: Business rules for the Tasks module — the only section with real logic. Use this before writing or reviewing ANY code touching tasks - employee cards, the task table, the result panel, the checkbox, completion, the late calculation, reopening, overdue flags, or task server actions. If a change involves the words task, deadline, result, complete, late, or reopen, read this first.
---

# Task rules

Implements SPEC.md §9 (read it in full once; this file is the operational summary), BR-05..BR-09, AC-07..AC-14. These rules are the reason the app exists — never trade them away for convenience.

## The completion gate (§9.3)

A result is satisfied by **any one** of: non-empty `resultText`, ≥1 FILE attachment, or ≥1 LINK attachment. Never require text when an attachment exists — forcing "see attached" teaches everyone the gate is theatre.

- **UX (FR-T06, AC-07):** clicking the checkbox on a resultless task opens the **result panel** — never a bare error. The panel accepts text, multiple file uploads (via the file service), and multiple links, and its save button **completes the task in the same step**. One action, not two. If a result already exists, the checkbox completes directly (optional confirm).
- **Server (BR-05, AC-08):** the completion action re-checks the gate inside the transaction and returns **422** when unsatisfied, regardless of what the client claimed. The UI is not the enforcement layer.
- Who may complete: the task's own employee, or any admin (§9.3). Enforced with the scoping helpers in skills/auth-roles.

## On completion — one transaction (§9.4)

```ts
// src/server/tasks/complete.ts — the only code path that completes a task
await db.$transaction(async (tx) => {
  const task = await tx.task.findFirstOrThrow({
    where: { id, status: "OPEN", isArchived: false, ...scopeTasks(user) },
    include: { attachments: true },
  });
  const hasResult = !!task.resultText?.trim() || task.attachments.length > 0;
  if (!hasResult) throw new UnprocessableError("RESULT_REQUIRED"); // → 422 (AC-08)

  const completedAt = new Date();                       // SERVER time (BR-06), never client
  const { wasLate, daysLate } = computeLateness(task.deadline, completedAt);
  await tx.task.update({ where: { id: task.id },
    data: { status: "COMPLETED", completedAt, wasLate, daysLate } }); // stored, not derived (BR-07)
  await tx.activityLog.create({ data: { actorId: user.id, entityType: "task",
    entityId: task.id, action: "complete", meta: { wasLate, daysLate } } });
});
```

## Late calculation (§9.4, D-06: date-only deadlines)

Deadline is a calendar date evaluated in **Africa/Cairo**. A task is late when it is completed after 23:59:59 on the deadline date, Cairo time. Completing on the deadline day is **on time** (AC-11).

```ts
// src/server/tasks/lateness.ts
import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays } from "date-fns";
const TZ = "Africa/Cairo";

export function computeLateness(deadline: Date /* @db.Date */, completedAt: Date) {
  const completedCairo = new TZDate(completedAt, TZ);        // completion instant → Cairo calendar date
  const deadlineDate   = new TZDate(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate(), TZ);
  const daysLate = Math.max(0, differenceInCalendarDays(completedCairo, deadlineDate));
  return { wasLate: daysLate > 0, daysLate };
}
```

Unit-test AC-10 (deadline 10 Aug, completed 13 Aug → `{ wasLate: true, daysLate: 3 }`) and AC-11 (23:30 Cairo on 10 Aug → on time), plus the midnight boundary (00:10 on 11 Aug Cairo → late by 1) and a UTC-vs-Cairo edge (21:30 UTC on 10 Aug = 00:30 Cairo 11 Aug → late by 1).

**Frozen forever (BR-07, AC-12):** `wasLate`/`daysLate` are written once at completion. Editing the deadline afterwards must not touch them — there is no recompute path. What was true at completion stays true.

## Reopening (§9.5)

Admins only (BR-08, AC-14 — employees get 403 even on their own tasks). Reopen clears `completedAt`, `wasLate`, `daysLate`, sets status `OPEN`, and writes an ActivityLog entry whose `meta` records the previous values. The result text/attachments remain.

## Display rules (§9.1–9.2)

- Cards: full name, job title, counts (open / overdue / completed), overdue count highlighted when > 0. Admins see every card; employees see only their own (payload-level, AC-13).
- Table columns exactly per §9.2; **default sort: open first, deadline ascending** — the next thing due sits on top. Deadline cell highlighted when passed and the task is still open (FR-T09). Late column renders blank / `On time` / `Late by N days`.
- "Overdue" for an **open** task = today (Cairo) is after the deadline date; it is computed live and is distinct from the stored `wasLate` of completed tasks. Never conflate the two.
- Creation date and Completed on are read-only, formatted in Africa/Cairo.
- Reassignment (FR-T12) is admin-only and logged with old → new employee in `meta`.
