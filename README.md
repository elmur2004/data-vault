# Database — agent workspace

A complete, agent-ready workspace for building **Database**, the internal ops registry for ByteForce and B-Systems (Forms · Sheets · Documents · Tasks). No application code exists yet — this folder is the briefing an agent builds it from: the specification, the rules, the skills, the agent roles, and the acceptance checklist.

Works natively in **Google Antigravity** (reads `AGENTS.md`, `.agents/rules`, `.agents/workflows`, `.agents/skills`) and in **Claude Code** (reads `CLAUDE.md`, `.claude/skills`, `.claude/agents`, `.claude/commands`). Any other coding agent can follow `AGENTS.md` directly.

## Quick start

**Antigravity:** open this folder as the workspace → Agent Manager → new agent → paste the main prompt from `START_PROMPT.md`. The agent will walk you through the open decisions (D-01 first — it decides whether employees get accounts, and roughly doubles the build), then plan, then build milestone by milestone with browser-verified walkthroughs. Shortcuts: `/decisions`, `/plan`, `/build-module <name>`, `/verify`.

**Claude Code:** run `claude` inside this folder → `/decisions` → `/plan` → approve → `/build-module bootstrap` … `/build-module tasks` → `/verify`. The same four roles exist as subagents (`architect`, `backend-builder`, `frontend-builder`, `qa-reviewer`).

**Multiple parallel agents:** spawn one Antigravity agent per brief in `agents/` (see `agents/README.md` for the handoff order).

## What's here

```
├── START_PROMPT.md        The prompts to paste to kick everything off
├── AGENTS.md              Operating manual (universal — every agent reads this first)
├── CLAUDE.md / GEMINI.md  Thin entry points for Claude Code / Gemini pointing at AGENTS.md
├── SPEC.md                Technical specification v1.0 — the source of truth (FR/BR/AC/NFR/D IDs)
├── docs/
│   ├── DECISIONS.md       Decision register: spec decisions D-01..D-10 (pending) + stack defaults
│   ├── ACCEPTANCE.md      Runnable checklist for AC-01..AC-17 + the Musts sweep
│   └── original-request.md  The owner's original short brief, preserved verbatim
├── skills/                Canonical skills (read before touching the matching area)
│   ├── spec-navigator/    Map of SPEC.md — where every requirement lives
│   ├── data-model/        Prisma reference schema + modeling rules
│   ├── auth-roles/        Better Auth, Argon2id, invitations, scoping, 403s
│   ├── file-service/      Uploads, content inspection, versioning, 5-min signed URLs
│   ├── task-rules/        Completion gate, late calculation, reopening — the app's heart
│   └── ui-design/         App shell, tables, cards, empty states, ByteForce brand system
├── brand/                 ByteForce assets: Lama Sans fonts, design tokens CSS, logos
├── agents/                Paste-ready mission briefs for parallel Antigravity agents (4 roles)
├── .agents/               Antigravity-native config
│   ├── rules/             Always-on rules (core, stack, verification)
│   ├── workflows/         /decisions /plan /build-module /verify
│   └── skills/            Pointer stubs → ../skills/*
├── .claude/               Claude Code-native config
│   ├── settings.json      Sensible permission allowlist
│   ├── agents/            The four roles as subagents
│   ├── commands/          The same four slash commands
│   └── skills/            Pointer stubs → ../skills/*
├── docker-compose.dev.yml Postgres + MinIO (S3) + Mailpit for local dev
├── .env.example           The environment contract (copy to .env)
└── .gitignore
```

Skills exist once, in `skills/`; the copies under `.agents/skills` and `.claude/skills` are pointer stubs so each tool auto-discovers them. Edit the canonical file only.

## How a build session flows

1. **Decisions** — SPEC.md §16 has ten open decisions; `docs/DECISIONS.md` tracks them. D-01 (employee accounts vs single-user labels) gates everything and is never assumed.
2. **Plan** — the agent writes `PLAN.md`: milestones M0–M9 mapped to FR/BR IDs and the AC items that prove each one. You approve before any code.
3. **Build** — one milestone at a time (file handling before the sections that depend on it, per SPEC §17), each ending lint/build-green, browser-verified, with a screenshot walkthrough.
4. **Verify** — the full `docs/ACCEPTANCE.md` run, including the direct-API negative tests (the completion gate must 422, cross-employee access must 403, a renamed `.txt`→`.pdf` must be rejected).

## Adjusting the defaults

The stack (Next.js + Postgres/Prisma + Better Auth + MinIO/S3 + Tailwind/shadcn) is a recorded default, not a law — change rows S-01..S-09 in `docs/DECISIONS.md` before M0 and tell the agent. Everything downstream (skills, rules) states *what* must hold (the spec's invariants) separately from *how* (the stack), so swaps stay contained.
