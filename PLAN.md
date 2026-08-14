# Vault — implementation plan

**For approval.** Written 2026-08-13 against [SPEC.md](SPEC.md) v1.0, [AGENTS.md](AGENTS.md), the six skills in `skills/`, and [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). All ten spec decisions are answered and recorded in [docs/DECISIONS.md](docs/DECISIONS.md) — nothing here rests on a Pending decision.

No application code exists yet. This is a greenfield build.

---

## What was decided

| ID | Answer | Consequence for this plan |
|---|---|---|
| **D-01** | **Option B — employee accounts** | M1 exists at all. Auth, invitations, roles, per-employee scoping, and AC-13/AC-14/AC-16 are in scope. This is the decision that makes it a ~4-week build rather than a ~2-week one. |
| D-02 | Rename to **Vault** | Every user-facing surface says Vault. Infrastructure identifiers stay `database_app` / `database-files` (DF-04). |
| D-03 | Employees read-only on Forms/Sheets/Documents | BR-10. All create/edit/archive paths are `requireAdmin()`. |
| D-04 | The §6.1 nine document types, unamended | `DocumentType` Postgres enum is closed at M5. |
| D-05 | Tasks carry an **optional** company tag | `Task.company` nullable. |
| D-06 | **Date-only** deadlines | Late = completed after 23:59:59 on the deadline date, Africa/Cairo. Defines `computeLateness`, AC-10 and AC-11. |
| D-07 | Document description **optional** | Overrides the original request. |
| D-08 | Employees cannot see each other's tasks | BR-09 / AC-13. Applies to the Tasks module *and* to global search results. |
| D-09 | 25 MB per file, ~20 GB year one | FR-S03, FR-D03, task attachments. |
| D-10 | **All four sections**, AGENTS.md order M0→M9 | No section deferred. File handling (M2) lands before Forms/Sheets/Documents/Tasks, per §17. |

Six `[default]` gap-fills (DF-01..DF-06) cover what the spec leaves silent: first-admin bootstrap, the deadline-reminder scheduler, task-attachment file types, the Vault rename boundary, backups, and the null-employee guard. All are recorded in [docs/DECISIONS.md](docs/DECISIONS.md) and cheap to overturn.

---

## Milestones

Effort is in focused working days. Total **≈18.5 days ≈ 4 working weeks**, which is consistent with SPEC §2.1's characterisation of Option B as "a five-week build".

Every milestone closes on the same gate ([AGENTS.md](AGENTS.md) *Definition of done*): `npm run lint` and `npm run build` green · its AC rows pass including the direct-API negatives · flows exercised in a real browser · designed empty states · all strings in the i18n catalog · ActivityLog entries written · no secrets committed.

---

### M0 — Bootstrap · 1 day

**Scope.** Next.js 15 App Router + TypeScript strict, `src/` layout per `.agents/rules/10-stack.md`. Tailwind v4 + shadcn/ui, with the ByteForce tokens from `brand/colors_and_type.css` mapped once into `globals.css` — no invented values. Lama Sans via `next/font/local` from `brand/fonts/` (copied into the app, not hotlinked). `next-intl` with a single `en` catalog and a lint rule that makes a hardcoded JSX string an error, so NFR-10 holds from day one rather than being retrofitted. Prisma initialised against the docker Postgres; `docker compose -f docker-compose.dev.yml up -d` bringing up Postgres, MinIO and Mailpit; `.env` from `.env.example`. The app shell: 240px sidebar (logo mark + "Vault", then Forms / Sheets / Documents / Tasks, user menu at the bottom), header with the global-search input in place, content region with page title and primary-action slot. Sidebar collapses to a drawer below `md`. Typed error classes — `Unauthorized`→401, `Forbidden`→403, `Unprocessable`→422 — established before any handler exists, so no endpoint invents its own contract.

**Covers.** §4 (IA) · §12 NFR-03 (shell) · NFR-10 · NFR-11 (focus-ring baseline) · S-01, S-05, S-06 · BR-15 groundwork (the Cairo formatting utility)

**Proves.** No numbered AC — M0 is foundation. Gate: lint + build green; shell renders correctly at 1280px and 375px; Lama Sans actually loading (not a fallback); brand tokens resolving. Evidence: two screenshots.

**Risk.** shadcn/ui's Tailwind v4 support and `next-intl`'s App Router API are both version-sensitive; pin versions at M0 rather than discovering drift at M8.

---

### M1 — Auth, roles, employees, invitations, deactivation · 2.5 days

**Scope.** Better Auth tables (user / session / account / verification) with `role UserRole` added to the user model, plus `Employee`, `Invitation` and `ActivityLog` models and their migration. Email + password only, **public sign-up disabled**, Argon2id via `@node-rs/argon2` overriding Better Auth's scrypt default (NFR-06). Middleware guarding every route except `/login`, `/activate/[token]` and static assets. `src/server/auth/guards.ts` with `requireUser` / `requireAdmin` / `scopeTasks` — the single authorisation pattern every later server action uses.

The invitation flow (§5.2): admin creates an Employee → server generates a 256-bit token, stores **only its SHA-256 hash**, sets `expiresAt = now + 7 days`, emails `${APP_URL}/activate/<token>` through Nodemailer to Mailpit. `/activate/[token]` hashes and looks up, requires unused and unexpired, and gives an expired screen with "ask your admin to re-invite" otherwise. The employee sets their own password (min 10 chars); the server creates the auth user with role `EMPLOYEE`, links `employee.userId`, stamps `usedAt`, signs them in. Single-use: a second visit fails. Admin re-invite revokes the old row and issues a new token.

Employees admin UI: list, create, edit, deactivate and reactivate. Deactivation sets `isActive = false` **and** revokes sessions / disables login; the card leaves the default view; there is no delete path anywhere in the codebase (BR-13). Self-service password reset by emailed single-use link, reusing the invitation token mechanism — included because §2.1 lists "password reset" among what Option B needs. Seed script creating the first admin (DF-01) and two or three employees. Login page and user menu (name, role, sign out; admins additionally get Employees and Archive).

**Covers.** §3, §3.1 (permission matrix) · §5.1, §5.2, §5.3 · BR-12, BR-13 · NFR-06, NFR-07

**Proves.** **AC-16, first half** — a deactivated employee's card is hidden from the default view. (The second half, task history retained, needs tasks and is re-proved at M6.) Gate additionally: invitation flow end-to-end through Mailpit; expired-token screen; second use of a token fails; a stored hash begins `$argon2id$`; an unauthenticated route request redirects to `/login`.

**Risk.** Better Auth's `password.hash` / `password.verify` override is a documented but version-sensitive surface — verify by inspecting a real stored hash, not by reading the config. Session revocation on deactivate is the easy half to forget.

---

### M2 — Shared services: file service, activity log, archival · 2 days

Built before Forms/Sheets/Documents/Tasks because three of them depend on it and SPEC §17 is explicit that improvising it per section is the thing most likely to need rework.

**Scope.** `StoredFile` model and `ScanStatus` enum. `src/server/files/` as the only code that talks to S3 — `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, MinIO in dev with `S3_FORCE_PATH_STYLE`, private bucket, `storageKey = <scope>/<uuid>` (non-guessable, non-sequential, never derived from the filename).

The upload pipeline, with no bypass: size check against `MAX_UPLOAD_MB` → **content inspection by magic bytes** with `file-type`, extension treated as a hint and never the verdict (BR-04) → persist to S3 then create the `StoredFile` row, deleting the object if the DB write fails and writing nothing if the S3 put fails → scan hook, `PENDING` until `MALWARE_SCAN=off` marks it `CLEAN` in dev or ClamAV rules in production, with **only `CLEAN` files ever servable** → the sheet row-count hook. Per-context allowlists: Sheets `xlsx/xls/csv`, Documents `pdf/docx/xlsx`, task attachments the wider DF-03 list. Filenames sanitised on storage, original retained for display and `Content-Disposition`.

Download and preview: presigned GET with `expiresIn` from `SIGNED_URL_TTL_SECONDS` (300), generated **per request** only after an authorisation check on the owning record and a `scanStatus === CLEAN` check. Never stored in the DB, never cached client-side beyond the immediate action. Versioning: replace runs the full pipeline, creates a `StoredFile` with `version + 1` and `replacesId`, repoints the owner's `fileId` in one transaction, and logs `replace_file`; old versions are never deleted.

Alongside it, the two cross-cutting services every module will use: the append-only ActivityLog writer (no update or delete path, entries written inside the same transaction as the change they record) and the archival service — one shared "not archived" query helper so no listing query forgets it, plus archive/restore, plus the admin Archive page shell.

**Covers.** §6.7, §6.8 · §10.2, §10.3 · BR-04, BR-11, BR-14 · S-04, S-08

**Proves.** **AC-05** (raw storage path unauthenticated → denied; authenticated → a signed URL that stops working after ~5 minutes) · **AC-06** (a `.txt` renamed `.pdf` rejected, via the API as well as the UI) · the archival mechanism behind **AC-15**, which gets its first end-to-end proof at M3 once a real record type exists. Unit tests on the content-inspection allowlists.

**Risks.** Three concrete ones, all in content inspection: `xlsx`, `docx` and `pptx` are ZIP containers and can generalise to `application/zip`, so detection needs a second step reading the ZIP central directory for `[Content_Types].xml` and the `xl/` / `word/` / `ppt/` part prefix. CSV has no magic bytes at all, so it needs a deliberate text sniff (decodes as UTF-8/latin, consistent delimiter, reject on binary) which is heuristic and will need fixtures. And MinIO presigned URLs signed with the in-container hostname are unusable from the browser — `S3_ENDPOINT` must be the browser-reachable host.

---

### M3 — Forms · 1.5 days

The first table, and therefore the expensive one: it builds the reusable responsive-table component that M4 and M5 inherit.

**Scope.** `Form` model and migration. Table listing name, company, notes, date added and a link control; company filter; sort by name and date added; free-text search across name and notes. Add/edit dialog with zod validation rejecting anything that isn't a well-formed `http`/`https` URL, with a field-level message that says what is wrong. Duplicate-URL warning on save — a confirm naming the existing form, not a block (FR-F08 is a *Should* and the spec says "warn"). Archive with a confirm reading "This moves it to the archive; admins can restore it", and restore from the Archive page. Admin-only controls simply don't render for employees, while the server still enforces. Designed empty state with "Add your first form", and a separate filtered-to-nothing state. Stacked cards below `md`. Every string in the catalog. ActivityLog on create / update / archive / restore.

**Covers.** FR-F01..FR-F08 · BR-01, BR-10, BR-11

**Proves.** **AC-01** (appears, company filter isolates, link opens a new tab) · **AC-02** (`notaurl` and `ftp://x` rejected with a field message, nothing saved) · **AC-15** (admin "delete" removes it from views and counts, still restorable) · Musts sweep: FR-F08 duplicate warning, §10.4 empty state. Plus a non-AC negative test worth running anyway: an employee POSTing to the form-create endpoint gets 403 (BR-10).

**Decision to take here, not at M8.** NFR-01 requires any table to load in under 1.5 s at 2,000 rows. Client-side TanStack filtering will not hold at that size. **Recommendation: server-side pagination, sort and filter from M3**, so M4 and M5 inherit it — retrofitting three tables at M8 costs more than building it once here.

---

### M4 — Sheets · 2 days

**Scope.** `Sheet` model, `SheetType` and `SheetStorage` enums, migration. Add dialog with a LINK-or-FILE toggle enforcing **exactly one** — a zod refinement, re-checked in the server action, with a Postgres `CHECK` constraint as belt-and-braces (BR-02). File upload of `xlsx`/`xls`/`csv` up to 25 MB through the M2 pipeline. Record count computed at upload and on every replacement (FR-S05): populated rows on the first worksheet via `exceljs`, CSV via a streaming parse, writing `lastRecordCount` and `lastRecordCountAsOf = today`. A manually entered count requires its as-of date (BR-03). Table listing name, type, company, date created, the count rendered as `1,240 as of 12 Jul 2026` — the number is meaningless without its date — notes and an open control. Linked sheets open in a new tab; uploaded sheets download by signed URL. Filter by company and type; sort by name, date created and record count; search name and notes. Edit and archive, admin only. Version chain retained on replacement. Empty states, stacked cards, catalog strings, ActivityLog.

Note that `dateCreated` is user-entered and deliberately distinct from `createdAt` (§6.3) — a detail that is easy to collapse by accident.

**Covers.** FR-S01..FR-S09 · BR-02, BR-03, BR-11, BR-14

**Proves.** **AC-03** (both supplied → rejected; neither → rejected; both through the UI *and* directly against the API) · **AC-04** (XLSX with N populated rows → count = N, as-of = today) · Musts sweep: FR-S03 size and type limits, FR-S06 versioning.

**Risks.** Two, both real. `exceljs` **cannot read legacy BIFF `.xls`** — FR-S03 requires accepting it and FR-S05 requires counting it. Either add SheetJS for that one format, or accept `.xls` for storage and leave its count manual with a clear note in the UI; FR-S05 is a *Should*, so degrading is legal, but it needs your call. Second, "populated rows, minus header row if present" is a heuristic, and AC-04's evidence depends on which answer we give — see Ambiguity A-1 below.

---

### M5 — Documents · 1.5 days

The third table, and the cheapest, per §17.

**Scope.** `Document` model and the `DocumentType` enum closed at the D-04 nine, plus migration. Add/edit with name, company, type, **optional** description (D-07) and a file — `pdf`/`docx`/`xlsx` up to 25 MB. Table listing name, type, company, description, date added and a download control. Download by signed URL valid 5 minutes (FR-D04). In-browser PDF preview in a dialog, using an `inline` signed URL (FR-D05). Replacement retains the previous version (FR-D06). Filter by company and type; sort by name and date added; search name and description. Archive, admin only. Empty states, stacked cards, catalog strings, ActivityLog.

**Covers.** FR-D01..FR-D09 · BR-04, BR-11, BR-14 · D-04, D-07

**Proves.** **AC-05** re-run on the real Documents path — AC-05 is worded about a document, so M2's proof is the mechanism and this is the acceptance · **AC-06** against the Documents allowlist · Musts sweep: FR-D03.

**Risk.** A 300-second signed URL inside an open preview dialog expires while the reader is still reading. The fix is re-signing on demand, not extending the TTL — BR-14 fixes it at 5 minutes and that is not negotiable.

---

### M6 — Tasks · 4 days

The largest milestone and the reason the app exists. Nothing in here gets traded for convenience.

**Scope.** `Task` and `TaskAttachment` models, `TaskStatus` and `AttachmentKind` enums, the `[employeeId, status, deadline]` index, migration.

*Layout (§9.1–9.2).* A grid of employee cards showing full name, job title, and open / overdue / completed counts, with the overdue count on an orange chip when above zero. Admins see every card; employees see only their own, and the scoping is in the query so other employees' data is not in the response payload at all. Each card expands to a task table with exactly the §9.2 columns, default-sorted open first by deadline ascending so the next thing due sits on top. The deadline cell is highlighted when it has passed and the task is still open. The Late column reads blank, "On time", or "Late by N days". Completed rows are muted with the name struck through.

*The completion gate (§9.3).* A result is satisfied by **any one** of non-empty result text, at least one file, or at least one link — never text-plus-attachment, because forcing someone to type "see attached" teaches everyone the gate is theatre. Clicking the checkbox on a task with no result **opens the result panel**, never a bare error (FR-T06). The panel takes text, multiple file uploads and multiple links, and its save button completes the task in the same step — one action, not two. If a result already exists, the checkbox completes directly.

*Completion (§9.4).* `src/server/tasks/complete.ts` is the only code path that completes a task. In one transaction it re-reads the task under the caller's scope, re-checks the gate and throws 422 when unsatisfied regardless of what the client claimed, stamps `completedAt` from **server** time, computes lateness, writes `wasLate` and `daysLate` as **stored** columns, and logs the completion. `src/server/tasks/lateness.ts` holds `computeLateness` with unit tests for AC-10, AC-11, the midnight boundary (00:10 Cairo on 11 Aug → late by 1) and the UTC-vs-Cairo edge (21:30 UTC on 10 Aug is 00:30 Cairo on the 11th → late by 1). There is **no recompute path** anywhere — editing a deadline afterwards cannot touch a stored lateness.

*Reopening (§9.5).* Admins only, 403 for employees even on their own tasks. Clears `completedAt`, `wasLate`, `daysLate`, returns status to OPEN, and logs an entry whose `meta` records the previous values. Result text and attachments survive.

*The rest.* Admin task create and edit; reassignment logged old → new (FR-T12). Filters by status, overdue and deadline range (FR-T13). An admin view listing every overdue task across all employees in one place (FR-T14). Email to the assignee on task creation, and a deadline-day reminder through the DF-02 cron route (FR-T15). XLSX export (FR-T16) is a *Could* — built only if M0–M8 are green with time to spare.

**Covers.** §9 in full · FR-T01..FR-T16 · BR-05, BR-06, BR-07, BR-08, BR-09 · BR-13 (completed)

**Proves.** **AC-07** (checkbox on a resultless task opens the panel; task stays open) · **AC-08** (direct API completion of a resultless task → **422**, task still open) · **AC-09** (a PDF alone, no text, completes) · **AC-10** (deadline 10 Aug, completed 13 Aug Cairo → late by 3) · **AC-11** (23:30 on 10 Aug Cairo → on time) · **AC-12** (admin edits the deadline afterwards → stored values unchanged) · **AC-13** (employee payload contains only their own card and tasks; direct API request for another employee's task → **403**) · **AC-14** (no reopen control; direct API reopen → **403**) · **AC-16** completed (history and late records retained after deactivation) · Musts sweep: FR-T06 one-action save, FR-T09 overdue flagging and counting, FR-T12 reassignment logged.

**Risks.** Two design problems worth naming before building. First, "one action, not two" collides with file upload: attachments have to exist before the transaction can re-check the gate. The sequence is client uploads files first with progress → then a single `completeWithResult` server action creates the attachments and completes atomically, so a 422 commits nothing; abandoned panels leave orphaned `StoredFile` rows and need a cleanup path. Second, AC-13 is worded at the **payload** level, not the view level — with React Server Components that means the scoping must live in the query, and no component may ever be rendered with unscoped data and filtered afterwards.

---

### M7 — Global search · 1 day

**Scope.** One header search, ⌘K plus a visible input, returning results **grouped by section**. Matches Form name and notes, Sheet name and notes, Document name and description, Task name and description. Archived records excluded. Role scoping applied — an employee's search results contain only their own tasks. Trigram or `ILIKE` indexes to hold NFR-02.

**Covers.** §10.1 · NFR-02 · BR-09 (scoping extends here)

**Proves.** **AC-17** (a matching record seeded in all four sections; the term returns results grouped by section).

**Risk.** Search is the second surface where AC-13 can leak. It must call the same `scopeTasks` helper rather than re-implementing the filter, and the AC-13 API test gets re-run against the search endpoint.

---

### M8 — NFR pass · 2 days

**Scope.** Responsive verification at 375px across all four sections — tables genuinely becoming stacked cards, sidebar as a drawer, dialogs full-screen. A full keyboard pass over one create-form and the task result panel, with visible violet focus rings throughout. A contrast audit against NFR-11, paying particular attention to the trap `skills/ui-design` flags: `#F15C24` fails on white for body text, so orange is only legal at ≥18px semibold, on `orange-100`, or as `#D94E18`. Performance: seed 2,000 rows, measure, and confirm NFR-01 (<1.5 s) and NFR-02 (<1 s) — cheap if M3 went server-side, expensive if it didn't. An empty-state audit across every section including filtered-to-nothing. An i18n audit confirming zero hardcoded strings. A BR-15 audit confirming UTC storage rendering as Africa/Cairo. Browser matrix per NFR-04. A documented, runnable backup and tested-restore procedure (DF-05).

**Covers.** NFR-01..NFR-05, NFR-09, NFR-10, NFR-11 · §10.4

**Proves.** No numbered AC, but the entire Musts-sweep tail of [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

---

### M9 — Full acceptance run · 1 day

**Scope.** The complete [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) checklist: AC-01 through AC-17 plus the Musts sweep, with the negative tests sent **directly to the endpoints** with curl and real sessions — not through the UI, because the UI hides the button and the point is that the server refuses anyway. Reported as `AC | pass/fail | evidence`. Anything failing blocks release; after fixing, the failed items plus AC-08 and AC-13 are re-run, since those two are the safety-critical pair.

**Proves.** All seventeen, together, on one build.

---

## AC coverage — every acceptance criterion has a home

| AC | What it proves | Milestone |
|---|---|---|
| AC-01 | Form creation, company filter, link opens | M3 |
| AC-02 | Malformed URL rejected, field-level | M3 |
| AC-03 | Sheet has exactly one of URL / file | M4 |
| AC-04 | Uploaded XLSX record count computed | M4 |
| AC-05 | Files private; signed URL 5 min | M2 mechanism → **M5** acceptance |
| AC-06 | Content inspection rejects a renamed file | M2 mechanism → **M4/M5** per allowlist |
| AC-07 | Checkbox with no result opens the panel | M6 |
| AC-08 | Completion gate server-side → **422** | M6 |
| AC-09 | Attachment alone satisfies the gate | M6 |
| AC-10 | Late by 3 days | M6 |
| AC-11 | On-time boundary at 23:30 | M6 |
| AC-12 | Lateness frozen after a deadline edit | M6 |
| AC-13 | Employee scoping; cross-employee → **403** | M6, re-tested at M7 |
| AC-14 | Employee cannot reopen → **403** | M6 |
| AC-15 | Archival, not deletion | M2 mechanism → **M3** acceptance |
| AC-16 | Deactivation preserves history | M1 (card hidden) → **M6** (history) |
| AC-17 | Global search grouped by section | M7 |

M0 and M8 prove no numbered AC by design: M0 is foundation, M8 is the NFR and Musts sweep.

---

## Risk register

Ordered by what would hurt most if ignored.

| # | Risk | Where | Mitigation |
|---|---|---|---|
| R-1 | **"One action, not two" vs file upload.** Attachments must exist before the transaction re-checks the gate, so completion cannot be a single round trip naively. | M6 | Upload files first with progress, then one atomic `completeWithResult` action. 422 commits nothing. Add an orphaned-`StoredFile` cleanup path for abandoned panels. |
| R-2 | **AC-13 is payload-level, not view-level.** An RSC that receives unscoped data and filters in the component passes visually and fails the AC. | M6, M7 | Scoping lives in the `where` clause via one shared `scopeTasks` helper. Search reuses it rather than re-implementing. Re-run the AC-13 API test against the search endpoint. |
| R-3 | **NFR-01 at 2,000 rows.** Client-side TanStack filtering will not hold; retrofitting three tables is far costlier than building it once. | M3 (decide), M8 (bites) | Server-side pagination, sort and filter from the first table. Recommended, and flagged for your approval now. |
| R-4 | **OOXML content inspection.** `xlsx`/`docx`/`pptx` are ZIP containers and can generalise to `application/zip`, defeating AC-06. | M2 | After magic-byte detection, read the ZIP central directory for `[Content_Types].xml` and the `xl/` / `word/` / `ppt/` part prefix. Unit-tested with fixtures. |
| R-5 | **`.xls` cannot be row-counted by `exceljs`.** FR-S03 accepts the format; FR-S05 wants a count. | M4 | Either add SheetJS for that one format, or accept `.xls` for storage with a manual count and a clear UI note. FR-S05 is a *Should*, so degrading is legal — **needs your call**. |
| R-6 | **CSV has no magic bytes.** The text sniff is heuristic and can reject legitimate odd files. | M2 | Decode check plus consistent-delimiter check, reject on binary; fixtures covering BOM, semicolon and tab delimiters, and CRLF. |
| R-7 | **Better Auth defaults to scrypt.** The Argon2id override is version-sensitive and silently wrong if it misses. | M1 | Verify against a real stored hash beginning `$argon2id$`, not against the config. NFR-06 evidence is the hash itself. |
| R-8 | **Signed URL expiry vs PDF preview.** A 300 s URL dies while someone is still reading. | M5 | Re-sign on demand. Do not extend the TTL — BR-14 fixes it at 5 minutes. |
| R-9 | **MinIO endpoint mismatch.** URLs signed with the in-container host are unusable from the browser. | M2 | `S3_ENDPOINT` set to the browser-reachable host, path-style addressing on. |
| R-10 | **Malware scanning is off in dev (S-08).** §10.3 requires scanning before a file becomes retrievable. | Deploy | Dev marks `CLEAN` immediately; production needs real ClamAV wiring. A deploy-time gap, not a build-time one — but it must not be forgotten. |
| R-11 | **FR-T15 deadline emails need a scheduler** that Next.js does not provide. | M6 / deploy | Cron-invoked route handler behind `CRON_SECRET`, idempotent per (task, date). Documented as a deployment dependency (DF-02). |
| R-12 | **NFR-08 backups** are infrastructure, and nothing in §14 scopes who builds them. | M8 / deploy | M8 delivers a runnable procedure and restore test; scheduling it is a deployment task (DF-05). Flag now if you expected it in-app. |
| R-13 | **Version pinning.** Tailwind v4 + shadcn/ui and `next-intl`'s App Router API are both moving surfaces. | M0 | Pin at M0. Discovering drift at M8 is the expensive version. |

---

## Ambiguities — what I will decide unless you say otherwise

None of these block the plan. Each is cheap to change before its milestone and expensive after.

**A-1 · Does the header row count? (affects AC-04 evidence.)** `skills/file-service` says "populated rows on the first worksheet, minus header row if present", but "if present" is a heuristic. **Default:** treat row 1 as a header when every non-empty cell in it is text *and* at least one cell in row 2 is not text; otherwise count all populated rows. The rule gets a unit test and a tooltip in the UI, because a record count nobody can explain is a record count nobody trusts.

**A-2 · Can an admin be assigned a task?** §9.1 describes cards as employees, and tasks reference `Employee`, not `User`. **Default:** an admin can be assigned tasks only if they also have an `Employee` row. Admins without one simply have no card.

**A-3 · One Archive page or per-section archives?** **Default:** a single admin Archive page with a section filter, matching where `skills/ui-design` puts "Archive" in the admin user menu.

**A-4 · FR-F08 duplicate-URL behaviour.** The spec says "warn". **Default:** a confirm step naming the existing form; save proceeds on confirm. Not a block.

**A-5 · Employee self-service.** Not specified. **Default:** employees can change their own password and nothing else; admins edit employee records. Password *reset* by emailed link is in M1 because §2.1 lists it under what Option B needs.

**A-6 · FR-T16 XLSX export** is a *Could*. **Default:** built only if M0–M8 close green with time remaining, per `skills/spec-navigator`'s priority rule.

---

## Out of scope — not being built

Per SPEC §15, and treated as a wall: no Drive/Sheets/Notion integration and no reading live row counts from linked sheets · no in-app file editing · no dead-link detection · no form building · no task comments, subtasks, dependencies, recurrence, multiple assignees, priorities, or board/Gantt/calendar views · no approval workflow on completion · no performance scoring beyond raw late counts · no native apps, offline mode, or public access · no full-text search inside file contents and no OCR · no bulk import · no 2FA · no second interface language, though every string is externalised from M0.

---

## What I need from you

1. **Approve the plan**, or tell me what to change.
2. **R-3** — confirm server-side pagination from M3. My recommendation; it costs a little now and a lot later.
3. **R-5** — for legacy `.xls`: add SheetJS to count it, or accept it with a manual count?
4. **R-12** — do you expect backups inside the application, or is infrastructure the right home?

Once approved I start M0 and stop after it with lint, build, and a browser walkthrough at 1280px and 375px.
