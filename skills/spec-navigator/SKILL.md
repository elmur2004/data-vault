---
name: spec-navigator
description: Map of SPEC.md for the Database app. Use this before implementing, estimating, or reviewing ANY feature, whenever an FR/BR/AC/NFR/D identifier appears, when deciding what a module must do, or when unsure whether something is in scope. Also use it when the human asks "what does the spec say about…".
---

# Spec navigator

`SPEC.md` (v1.0, 4 Aug 2026) is the single source of requirements. Do not paraphrase it from memory — open the section and cite the ID.

## Where things live

| Topic | Section |
|---|---|
| Purpose & the four modules | §1 |
| The blocking decision (employee accounts) + naming | §2 (D-01, D-02) |
| Roles & permission matrix | §3, §3.1 |
| Navigation / IA (sidebar + global header search) | §4 |
| Employees, invitations, deactivation | §5 |
| Enums & every entity's field table | §6 (6.1 enums, 6.2 Form, 6.3 Sheet, 6.4 Document, 6.5 Task, 6.6 TaskAttachment, 6.7 StoredFile, 6.8 ActivityLog) |
| Forms requirements | §7 → FR-F01..F08 |
| Sheets / Documents requirements | §8 → FR-S01..S09, FR-D01..D09 |
| Tasks: layout, columns, completion gate, late calc, reopening | §9 → FR-T01..T16 |
| Search, archival, file handling, empty states | §10 |
| Validation rules | §11 → BR-01..BR-15 |
| Non-functional requirements | §12 → NFR-01..NFR-11 |
| Acceptance criteria | §13 → AC-01..AC-17 (operationalised in `docs/ACCEPTANCE.md`) |
| In scope / out of scope | §14 / §15 |
| Open decisions | §16 → D-01..D-10 (statuses in `docs/DECISIONS.md`) |
| Build-order advice | §17 (file handling first; Tasks is the biggest) |

## Rules of engagement

- **Priorities.** Every FR row is Must / Should / Could. Never cut a Must. Ship Shoulds unless the human trades them out. Coulds (e.g. FR-T16 XLSX export) only when everything else is green.
- **Out of scope is a wall.** §15 exists to stop drift: no Drive/Notion integration, no in-app editing, no comments/subtasks/recurrence, no priorities, no board/Gantt views, no file-content search, no 2FA, no second language (strings still externalised). If a "nice idea" appears there, it is a no.
- **The spec already answered your question.** Common gotchas it settles: description on Documents is recommended optional (§6.4, D-07); `last_record_count` needs an as-of date and is computed for uploaded sheets (§6.3.1); Sheets' `date_created` is user-entered and distinct from `created_at`; the interface may say Delete but the behaviour is archival (§10.2); employees are deactivated, never deleted (§5.3).
- **Cite IDs.** In plans, commit messages, and PR descriptions, reference the IDs you satisfy ("implements FR-S02, enforces BR-02"). QA maps evidence back the same way.
- **When the spec is genuinely silent**, choose the smallest option consistent with its tone, mark it `[default]` in `docs/DECISIONS.md`, and tell the human.
