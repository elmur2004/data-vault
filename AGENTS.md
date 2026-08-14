# Database — Agent Operating Manual

Internal ops registry for **ByteForce** and **B-Systems**. Four modules: **Forms, Sheets, Documents, Tasks**. The first three are a tagged link/file index; Tasks is a tracker with a result-gated completion and a stored late calculation. Two roles (Admin, Employee) with server-enforced permissions.

Read this file at the start of every session. It is short on purpose — the detail lives in the files it points to.

## Source of truth, in order

1. `SPEC.md` — full technical specification v1.0. Requirements carry IDs (`FR-*`, `BR-*`, `AC-*`, `NFR-*`, `D-*`). Cite the ID when justifying an implementation choice. Never contradict SPEC.md silently.
2. `docs/DECISIONS.md` — resolved and pending decisions, including the stack. If a decision you depend on is **Pending**, stop and ask the human (or run the `/decisions` workflow). **D-01 (employee accounts) gates everything.**
3. `skills/` — how-to knowledge. Read the matching skill **before** touching its area (table below).
4. `docs/ACCEPTANCE.md` — the runnable acceptance checklist. A milestone is not done until its items pass.

## Skills — read before working on the matching area

| Working on… | Read first |
|---|---|
| Anything (what does the spec require?) | `skills/spec-navigator/SKILL.md` |
| Prisma schema, migrations, entities, enums, queries | `skills/data-model/SKILL.md` |
| Login, sessions, invitations, passwords, roles, scoping, 403s | `skills/auth-roles/SKILL.md` |
| Uploads, downloads, signed URLs, validation, versioning, storage | `skills/file-service/SKILL.md` |
| Tasks module: completion gate, late calc, reopening, overdue | `skills/task-rules/SKILL.md` |
| Any UI: layout, tables, cards, empty states, brand, responsive | `skills/ui-design/SKILL.md` |

## Stack (defaults — recorded in docs/DECISIONS.md; change only with human approval)

- **Next.js 15+ (App Router) + TypeScript strict** — one repo, server actions + route handlers.
- **PostgreSQL 16 + Prisma** — real enums per SPEC §6.1. Local via `docker-compose.dev.yml`.
- **Better Auth** (email + password) — **Argon2id** hashing (NFR-06), roles `ADMIN` / `EMPLOYEE`, no public signup; admin-created employees activate via single-use 7-day invitation links (SPEC §5.2).
- **S3-compatible object storage** — MinIO locally, R2/S3 in production. Private bucket, presigned GET URLs valid **300 seconds** (BR-14). Never local-disk `public/` storage.
- **Tailwind CSS v4 + shadcn/ui + TanStack Table**; `next-intl` with a single `en` catalog (NFR-10: strings externalised from day one).
- **Nodemailer** → Mailpit locally for invitation and deadline emails.
- Dates: store **UTC**, display **Africa/Cairo** (BR-15/NFR-09).

## Dev commands

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres :5432, minio :9000/:9001, mailpit :8025
npm install
npx prisma migrate dev
npm run dev                                       # http://localhost:3000
npm run lint && npm run build                     # must be green before a milestone closes
npx prisma studio                                 # inspect data
```

## Build order (from SPEC §17 — file handling before the sections that depend on it)

| M | Milestone | Key spec refs |
|---|---|---|
| M0 | Bootstrap: Next.js, Prisma, docker services, i18n shell, app layout | §12 |
| M1 | Auth, roles, employees, invitation activation, deactivation | §3, §5, D-01 |
| M2 | Shared services: file service (validate/version/sign), activity log, archival pattern | §10.2, §10.3, §6.7–6.8 |
| M3 | Forms | §7 (FR-F01..F08) |
| M4 | Sheets, incl. computed record count on upload | §8.1 (FR-S01..S09) |
| M5 | Documents, incl. PDF preview | §8.2 (FR-D01..D09) |
| M6 | Tasks: cards, result panel, completion gate, late calc, reopening | §9 (FR-T01..T16) |
| M7 | Global header search grouped by section | §10.1, AC-17 |
| M8 | NFR pass: responsive to 375px, a11y, perf, empty states | §12, §10.4 |
| M9 | Full acceptance run | docs/ACCEPTANCE.md (AC-01..AC-17) |

Work one milestone at a time. Plan → implement → verify in the browser → show a short walkthrough → only then continue.

## Invariants that must never break (enforced server-side, no exceptions)

- **BR-05 / AC-08** — a task cannot be completed without result text, a file, or a link. Direct API attempts return **422**.
- **FR-T06** — clicking the checkbox with no result opens the result panel; it never shows a bare error.
- **BR-06 / BR-07** — `completed_at` from server time; `was_late` + `days_late` computed **once at completion and stored**. Later deadline edits never alter them (AC-12).
- Late calc: date-only deadline, Africa/Cairo; late means completed after 23:59:59 on the deadline date; completing on the deadline day is on time (AC-10/AC-11).
- **BR-08** — only admins reopen completed tasks; reopening clears completion fields and writes an audit entry.
- **BR-09 / BR-10 / AC-13** — employees see and touch only their own tasks (query-layer scoping, 403 otherwise) and never create/edit forms, sheets, or documents.
- **BR-02** — a sheet has exactly one of URL or file.
- **BR-04 / AC-06** — uploads validated by content inspection (magic bytes), not extension.
- **BR-11 / AC-15** — nothing is hard-deleted. "Delete" archives; admins can restore.
- **BR-14 / AC-05** — files reachable only through signed URLs (300 s), authorised per request.
- **BR-12 / NFR-06** — passwords: Argon2id, never displayed, never patterned.

## Definition of done (each milestone)

`npm run lint` and `npm run build` green · relevant `AC-*` items pass, including the negative direct-API tests · flows verified in a real browser · empty states designed, not blank tables (§10.4) · UI strings in the i18n catalog · no secrets committed · ActivityLog entries written for create/edit/archive/complete/reopen.

## Safety

Ask before: destructive git commands, dropping/resetting the database with data in it, deploying, pushing to remotes, or adding paid services. Never commit `.env`. Never weaken an invariant above to make a test pass.
