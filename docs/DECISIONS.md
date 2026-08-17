# Decision register

Agents: check this file before building anything that depends on a decision below. If the status is **Pending**, stop and ask the human (or run `/decisions`). When the human answers, update the status, the answer, and the date. Never mark a Pending item Adopted on your own.

## Spec decisions (SPEC.md §16)

All ten answered by the human on **2026-08-13**. None are Pending. D-01 was confirmed explicitly in its own question.

| ID | Question | Spec recommendation | Status | Answer |
|---|---|---|---|---|
| D-01 | Do employees log in and complete their own tasks, or single-user with employees as labels? | **Option B: employee accounts.** The result gate is meaningless if an admin fills it in for them. Blocks everything. | **Adopted (spec recommendation) — 2026-08-13** | **Option B — employee accounts.** Admin + every employee logs in; employees enter their own results and complete their own tasks. SPEC.md §5, the §3.1 permission matrix, per-employee scoping, and AC-13/AC-14/AC-16 are all **in scope**. |
| D-02 | Keep the name "Database"? | Rename (Vault / Index / Registry / Hub / BF Ops). Decide early; cosmetic. | **Adopted (renamed) — 2026-08-13** | **Rename to "Vault".** Applies to everything user-facing: sidebar/app name, page titles, login page, email subjects and sender name, `package.json` name, i18n catalog. See `[default]` DF-04 below for infrastructure identifiers. |
| D-03 | Can employees add forms/sheets/documents? | Read-only in v1. | **Adopted (spec recommendation) — 2026-08-13** | Employees are **read-only** on Forms, Sheets, Documents (BR-10). Create/edit/archive are `requireAdmin()`. |
| D-04 | Close the document-type list | Adopt §6.1 list: Contract, Proposal, Invoice, Report, Presentation, Brand asset, Legal, HR, Other — amended to real categories. | **Adopted (spec recommendation) — 2026-08-13** | The list is **closed** at the §6.1 nine, unamended: `CONTRACT`, `PROPOSAL`, `INVOICE`, `REPORT`, `PRESENTATION`, `BRAND_ASSET`, `LEGAL`, `HR`, `OTHER`. Postgres enum `DocumentType`. Adding a value later is a migration; renaming/removing one after records exist is not cheap. |
| D-05 | Do tasks carry a company tag? | Yes, optional field. | **Adopted (spec recommendation) — 2026-08-13** | Yes — `Task.company` is a **nullable** `Company`. Not required; internal tasks may belong to neither company. |
| D-06 | Deadline: date or datetime? | Date only, evaluated in Africa/Cairo. | **Adopted (spec recommendation) — 2026-08-13** | **Date only** (`@db.Date`). Late = completed after 23:59:59 on the deadline date, Africa/Cairo. Completing on the deadline day is on time (AC-11). The alternative datetime rule in §9.4 does **not** apply. |
| D-07 | Is document description required? | Optional. | **Adopted (spec recommendation) — 2026-08-13** | **Optional.** Overrides the original request, which marked it required (see `docs/original-request.md`). |
| D-08 | Can employees see each other's tasks? | No in v1. | **Adopted (spec recommendation) — 2026-08-13** | **No.** Employees see only their own card and tasks, enforced at the query layer; cross-employee API access returns 403 (BR-09, AC-13). |
| D-09 | Storage budget / per-file limit | 25 MB per file, ~20 GB year one. Confirm against hosting. | **Adopted (spec recommendation) — 2026-08-13** | **25 MB per file** (`MAX_UPLOAD_MB=25`), ~20 GB total in year one (NFR-05). Applies to Sheets (FR-S03), Documents (FR-D03), and each task attachment (§10.3). Re-confirm against the production hosting plan before deploy. |
| D-10 | Build all four sections or Tasks first? | All four if timeline allows; Tasks first if tight. | **Adopted (spec recommendation) — 2026-08-13** | **All four**, in the AGENTS.md build order M0 → M9 (file handling before the sections that depend on it, per §17). No section is deferred. |

## Stack decisions (scaffold defaults — human may override before M0)

| ID | Decision | Default | Status |
|---|---|---|---|
| S-01 | Framework | Next.js 15+ App Router, TypeScript strict, single repo | Adopted (default) |
| S-02 | Database | PostgreSQL 16 + Prisma (native enums) | Adopted (default) |
| S-03 | Auth | Better Auth, email+password, Argon2id via `@node-rs/argon2`, no public signup, invitation activation | Adopted (default) |
| S-04 | File storage | S3-compatible (MinIO dev / R2 or S3 prod), private bucket, presigned GET 300 s | Adopted (default) |
| S-05 | UI | Tailwind v4 + shadcn/ui + TanStack Table, ByteForce brand tokens from `brand/` | Adopted (default) |
| S-06 | i18n | `next-intl`, single `en` catalog, all UI strings externalised (NFR-10) | Adopted (default) |
| S-07 | Email | Nodemailer → Mailpit (dev), any SMTP (prod) | Adopted (default) |
| S-08 | Malware scan (§10.3) | Pluggable hook: `MALWARE_SCAN=off` in dev (marks CLEAN), ClamAV in prod. Files served only when scan status is CLEAN. | Adopted (default) |
| S-09 | Timezone | Store UTC, display Africa/Cairo (BR-15) | Adopted (default) |

## Agent defaults — where SPEC.md is silent

Per `skills/spec-navigator`: when the spec is genuinely silent, take the smallest option consistent with its tone, record it here as `[default]`, and tell the human. Any of these can be overturned at no cost before the milestone that implements it.

| ID | Gap | `[default]` chosen | Milestone | Overturn cost |
|---|---|---|---|---|
| DF-01 | SPEC.md §5.2 covers admin-created *employees*, but never says how the **first admin** comes to exist. There is no public signup (S-03). | `prisma/seed.ts` creates one admin from `SEED_ADMIN_EMAIL` and a generated password **printed once to the console**, never written to the repo or the DB in readable form (BR-12). Idempotent; refuses to run against a database that already has an admin. | M1 | Trivial |
| DF-02 | FR-T15 requires an email "on the deadline day". Next.js has no scheduler. | A `GET /api/cron/deadline-reminders` route handler guarded by a `CRON_SECRET` bearer token, idempotent per (task, date), invoked by the host's scheduler (Vercel Cron / systemd timer / GitHub Action). Documented as a **deployment dependency**, not an in-app daemon. | M6 | Low |
| DF-03 | §10.3 sets allowed types for Sheets and Documents but not for **task attachments**. `skills/file-service` proposes a wider list marked `[default]`. | Task attachments accept `pdf`, `docx`, `xlsx`, `pptx`, `png`, `jpg`, `txt` — wider than Documents, because a task result is legitimately a screenshot. Still content-inspected (BR-04); still 25 MB (D-09). | M2 | Trivial |
| DF-04 | D-02 renames the app to Vault, but `.env.example` and `docker-compose.dev.yml` (described as "the environment contract") use `database_app` / `database-files`. | **Infrastructure identifiers stay as-is** (`database_app`, `database-files`) so the committed environment contract keeps working unchanged. "Vault" applies to every user-facing surface only. | M0 | Low (a DB rename + bucket rename before any data exists) |
| DF-05 | §12 NFR-08 requires daily automated backups with a tested restore. Nothing in §14 scopes who builds it. | Treated as **infrastructure, outside the application build**. M8 delivers a documented, runnable `pg_dump` + object-storage sync procedure and a restore test script; wiring it to a scheduler is a deployment task. | M8 | n/a — flag if you expect it in-app |
| DF-06 | §9.1 says employees see only their own card. It does not say what an employee with **no** `Employee` record linked to their user sees. | Cannot occur by construction — every account is created from an Employee row (§5.2). The guard still handles it: a session whose `employeeId` is null gets an empty scoped result, never an unscoped one. Fail closed. | M1 | n/a |

## Build-time deviations from the recorded stack

Forced by the machine the build ran on, not by preference. None of them reach `src/` —
see `docs/LOCAL-DEV-WINDOWS.md`.

| ID | Deviation | Reason | Impact |
|---|---|---|---|
| DV-01 | **PostgreSQL 17.9**, not 16 (S-02) | The PG17 binaries were already installed; no PG16 present and no Docker to supply one. | None. Prisma targets both identically; no version-specific feature is used. |
| DV-02 | **No Docker.** Postgres, MinIO and Mailpit run as native processes from `.devservices/`. | Docker is not installed and installing it needs admin rights this session does not have. | None to the app. `docker-compose.dev.yml` is untouched and remains the canonical contract. |
| DV-03 | **Postgres on :55432**, not 5432 | 5432 is the machine's own PG17 service, 5433 an embedded Postgres belonging to `D:\CRM`. An isolated cluster avoids touching either. | `.env` only. |
| DV-04 | **App on :3001**, not 3000 | Port 3000 is held by another Node dev server on this machine. | `.env` only. |
| DV-06 | **S-04 changed: files are stored on the local filesystem, not object storage.** S3/MinIO and the AWS SDK are removed entirely. | Requested by the human. | §10.3 and BR-14/AC-05 still hold — files sit outside `public/`, are authorised per request, and are served only through an app-signed link that expires in 300 s. What is given up is the production posture S-04 assumed: files live on the app server, so multiple instances do not share them and ephemeral disks lose them. `src/server/files/storage.ts` is the only module that touches storage, so reversing this is a one-file change. See `docs/FILE-STORAGE.md`. |
| DV-05 | **R-5 resolved: legacy `.xls` is accepted for storage but its record count stays manual.** `exceljs` reads only OOXML `.xlsx`. | The maintained npm build of SheetJS carries known prototype-pollution/ReDoS advisories, and pulling a package with open CVEs into an app whose whole posture is content inspection and least privilege is a bad trade for a *Should*-priority count (FR-S05). | FR-S03 (accept `.xls`) fully met. FR-S05 degraded for `.xls` only, with a UI note; `.xlsx` and `.csv` count automatically. Revisit if a clean reader appears. |

## Log

- 2026-08-13 — Register created by scaffold. All spec decisions pending human answers.
- 2026-08-13 — **D-01 answered explicitly: Option B, employee accounts.** Auth, invitations, roles, per-employee scoping and AC-13/AC-14/AC-16 are in scope. `skills/auth-roles` applies in full. Everything is unblocked.
- 2026-08-13 — D-02 answered: **rename to "Vault"** (user-facing surfaces only; see DF-04).
- 2026-08-13 — D-10 answered: **build all four sections** in the AGENTS.md M0→M9 order.
- 2026-08-13 — D-03, D-04, D-05, D-06, D-07, D-08, D-09 answered: **adopt the spec's recommendation** for each, unamended.
- 2026-08-13 — Six `[default]` gap-fills recorded (DF-01..DF-06) covering first-admin bootstrap, the deadline-reminder scheduler, task-attachment types, the Vault rename boundary, backups, and the null-employee guard.
