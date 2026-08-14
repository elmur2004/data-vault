# Acceptance run — results

**Date:** 2026-08-13 · **Build:** lint green, typecheck green, `npm run build` green
**Automated tests:** 136 passing across 8 files · **Browser criteria:** 10/10

Every item below was executed, not read. The negative tests marked **API** were sent
straight at the endpoint with a real session cookie, because the interface hides those
controls and the server has to refuse anyway.

Reproduce with:

```bash
npm run services:start
npm run db:seed && npm run db:demo
npm run dev
npm test                                            # 136 automated
SEED_ADMIN_PASSWORD=… npx tsx scripts/checks/acceptance.ts   # browser criteria
SEED_ADMIN_PASSWORD=… npx tsx scripts/checks/perf.ts         # NFR-01 / NFR-02
```

## AC-01 … AC-17

| AC | Pass | Evidence |
|---|:--:|---|
| **AC-01** Form creation and access | ✅ | Created via the UI, appeared in the table; `?company=BYTEFORCE` hid it and `?company=BSYSTEMS` showed it; link carries `target="_blank"`. `evidence/acceptance/ac-01-forms.png` |
| **AC-02** URL validation | ✅ | `notaurl` and `ftp://x` both rejected with a field-level message under the input; API confirms **nothing was saved**. Also covers `javascript:` and `mailto:`, which bare `new URL()` accepts. `ac-02-url-validation.png` |
| **AC-03** Sheet storage exclusivity | ✅ | Rejected at three layers: the zod discriminated union makes both/neither unrepresentable, the server action re-checks, and a Postgres `CHECK` (`sheet_storage_exclusive`) refuses a raw INSERT. Tested by attempting the raw INSERT — `tests/integration/sheets-documents-search.test.ts` |
| **AC-04** Record count computed | ✅ | A real 37-data-row XLSX built in memory → count 37, as-of today (integration). A 312-row CSV in the demo renders **"312 as of 13 Aug 2026"**. `ac-04-record-count.png` |
| **AC-05** Document access control | ✅ | Anonymous GET of the raw storage path → **403** from MinIO; `npm run storage:init` fails the build if the bucket is ever public. Authenticated download issues a presigned URL with `X-Amz-Expires=300`; a tampered signature is refused. Anonymous request to `/api/files/:id` never returns a signed URL. |
| **AC-06** File type validation | ✅ | A `.txt` renamed `.pdf` is refused by the pipeline and leaves **no database row**. Also: an executable renamed `.pdf`, and a plain ZIP renamed `.xlsx` (OOXML is discriminated by reading the archive's own part names). 17 unit tests + pipeline tests. |
| **AC-07** Completion gate (UI) | ✅ | Clicking the checkbox on a resultless task **opens the result panel** — no error, no toast — and the task stays open. Save is disabled while text, files and links are all empty. `ac-07-result-panel.png` |
| **AC-08** Completion gate, server side | ✅ | **API:** `POST /api/tasks/:id/complete` with an empty body → **422 `RESULT_REQUIRED`**, task still `OPEN`, `completedAt` still null. Whitespace-only text → 422 as well. `tests/integration/api-negatives.test.ts` |
| **AC-09** Result by attachment alone | ✅ | A PDF uploaded as the only result completes the task, with `resultText` left null — no "see attached" required. Link-only also completes. |
| **AC-10** Late calculation | ✅ | Deadline 10 Aug, completed 13 Aug Cairo → `{ wasLate: true, daysLate: 3 }`. `src/server/tasks/lateness.test.ts` |
| **AC-11** On-time boundary | ✅ | 23:30 Cairo on the deadline day → on time. Also 23:59:59, and 00:10 the next day → late by 1. Includes the trap where 21:30 UTC is already tomorrow in Cairo, and a winter (UTC+2) case. |
| **AC-12** Lateness is frozen | ✅ | Task completed late by 3; an admin then moved the deadline to 2030 — stored `wasLate`, `daysLate` and `completedAt` all unchanged. There is no recompute path in the codebase. |
| **AC-13** Employee scoping | ✅ | **API:** another employee's task → **403**; the list payload contains only the caller's own rows and does not contain the other task's id anywhere. Search does not leak it either. Employee UI shows one card and no other names. `evidence/ui/tasks-employee-desktop.png` |
| **AC-14** Employee cannot reopen | ✅ | **API:** employee reopening their own completed task → **403**, task still `COMPLETED`; the same call as admin → 200. No reopen control renders for an employee. |
| **AC-15** Archival | ✅ | Deleting removed the row from the list **and from the count**, the record remained in the database, appeared in Archive, and restored intact. `ac-15-archive.png` |
| **AC-16** Deactivation preserves history | ✅ | Deactivation revoked the sessions (the live session could no longer browse), hid the card from the default view, kept it visible under "Show deactivated", and retained the employee and their task history. `scripts/checks/m1.ts` |
| **AC-17** Global search | ✅ | "nile" → 7 results **grouped by section**: Documents · 3, Tasks · 2, Sheets · 1, Forms · 1. `ac-17-search.png` |

## Musts sweep

| Item | Pass | Evidence |
|---|:--:|---|
| FR-F08 duplicate URL warns | ✅ | Saving a second form with an existing address warned and **named** the existing form; saving again went through. |
| FR-S03 / FR-D03 upload limits | ✅ | Over 25 MB refused with the limit stated. Sheets accept xlsx/xls/csv; documents accept pdf/docx/xlsx and refuse CSV. |
| FR-T06 + §9.3 one action | ✅ | The result panel's single save records the result **and** completes the task; a 422 commits nothing, leaving no orphaned attachments. |
| FR-T09 overdue flagged | ✅ | Passed deadlines on open tasks show an orange chip and count on the card; completed tasks are never "overdue". |
| FR-T12 reassignment logged | ✅ | Moving a task between employees writes a `reassign` entry with both ids. |
| §10.4 empty states | ✅ | Every section has a designed empty state with its primary action, and employees see an explanatory note instead of a button they cannot use. |
| BR-15 / NFR-09 Cairo display | ✅ | Timestamps stored UTC, rendered `d MMM yyyy` in Africa/Cairo through one formatting module. |
| NFR-01 tables under 1.5 s at 2,000 rows | ✅ | **2,014 forms**: first page **231 ms**, filtered 232 ms, searched 234 ms, page 40 **224 ms** — all against the production build. Flat across depth because paging is done in the database. |
| NFR-02 search under 1 s | ✅ | **38 ms** median. |
| NFR-03 responsive to 375px | ✅ | No horizontal scroll on any of the six screens; tables become stacked cards; the sidebar becomes a drawer. |
| NFR-11 keyboard and focus | ✅ | Focus ring measured as `solid 2px rgb(83, 68, 155)` — the brand violet, verified from the keyboard path. Full keyboard pass on the create form and the result panel. |
| ActivityLog append-only | ✅ | create / update / archive / restore / complete / reopen / reassign / invite / activate / deactivate all write entries with actor and timestamp; reopen records the previous lateness values. |

## Not verified here, and why

| Item | Status |
|---|---|
| **§10.3 malware scanning (R-10)** | `MALWARE_SCAN=off` in development marks every upload CLEAN. The hook, the ordering (only `CLEAN` files are servable) and the fail-closed behaviour are implemented and tested, but **a real scanner must be wired before production** — this is a release blocker, not a build gap. |
| **NFR-08 daily backup with tested restore** | Infrastructure, outside the application (DF-05). The procedure is documented; scheduling it is a deployment task. |
| **NFR-04 browser matrix** | Verified in Chromium only. Safari and Firefox remain to be checked on the target machines. |
| **FR-T15 deadline-day email** | The cron route exists, is secret-guarded and is idempotent per task per day; it needs a scheduler wired at deploy time (DF-02). Task-creation email works and is visible in Mailpit. |
| **FR-T16 XLSX export** | A *Could*. Not built — see A-6. |
