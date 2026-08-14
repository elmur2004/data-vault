# Acceptance checklist

Run after M9 (and the relevant subset after each milestone). Every item maps to an AC in SPEC.md §13 — read the AC there for the full given/when/then. Record pass/fail with evidence (screenshot, response code, or query output). The negative tests marked **API** must be sent directly to the endpoint (curl/fetch), not through the UI, because the UI hides the button — the server must still refuse.

| # | Check | How to verify |
|---|---|---|
| AC-01 | Form appears, filters by company, link opens new tab | Add a form in the UI; use the company filter; click the link |
| AC-02 | Malformed form URL rejected with field message | Submit `notaurl` and `ftp://x` — field-level error, nothing saved |
| AC-03 | Sheet: exactly one of URL / file | Try both supplied → rejected; try neither → rejected (UI and **API**) |
| AC-04 | Uploaded XLSX record count computed | Upload an XLSX with N populated rows → count = N, as-of = today |
| AC-05 | Files private; signed URL 5 min | Request the raw storage path unauthenticated → denied. Authenticated download issues a URL that stops working after ~5 min |
| AC-06 | Content inspection | Rename a `.txt` to `.pdf`, upload → rejected (**API** too) |
| AC-07 | Checkbox with no result opens result panel | Click the checkbox on a resultless task → panel opens, task stays open |
| AC-08 | Completion gate server-side | **API**: POST completion for a resultless task → **422**, task still open |
| AC-09 | Attachment alone satisfies the gate | Upload only a PDF as result, no text → completion succeeds |
| AC-10 | Late calc | Deadline 10 Aug, complete 13 Aug (Africa/Cairo) → Late by 3 days |
| AC-11 | On-time boundary | Deadline 10 Aug, complete 23:30 on 10 Aug Cairo time → On time |
| AC-12 | Lateness frozen | Complete late by 3; admin edits deadline → stored late status/days unchanged |
| AC-13 | Employee scoping | Log in as employee → only own card/tasks in the response payload; **API** request for another employee's task → **403** |
| AC-14 | Employee cannot reopen | As employee, no reopen control; **API** reopen attempt → **403** |
| AC-15 | Archival, not deletion | Admin "deletes" a record → gone from views and counts, restorable from archive |
| AC-16 | Deactivation preserves history | Deactivate an employee with completed tasks → card hidden by default, task history (incl. late records) retained |
| AC-17 | Global search | Seed a matching record in all four sections; search the term → results grouped by section |

## Musts sweep (spot checks beyond the ACs)

- FR-F08: adding a form with an existing URL warns about the duplicate.
- FR-S03 / FR-D03: uploads over 25 MB rejected; sheet accepts xlsx/xls/csv, documents accept pdf/docx/xlsx only.
- FR-T06 + §9.3: the result panel's save action completes the task in the same step — one action, not two.
- FR-T09: overdue open tasks flagged in the table and counted on the card.
- FR-T12: reassignment works and is logged in the ActivityLog.
- §10.4: every section shows a designed empty state with its primary action when there is no data.
- BR-15 / NFR-09: a timestamp stored in UTC renders in Africa/Cairo in the UI.
- NFR-03: at 375 px wide, tables become stacked cards and everything remains usable.
- NFR-11: full keyboard pass on one create-form and the task result panel; visible focus states; AA contrast on brand colors (see `skills/ui-design/SKILL.md`).
- ActivityLog: create/edit/archive/complete/reopen each write an append-only entry with actor and timestamp.

## Reporting format

Produce a table: `AC | pass/fail | evidence`. Anything failing blocks release; fix and re-run the failed items plus AC-08 and AC-13 (the two most safety-critical) before declaring done.
