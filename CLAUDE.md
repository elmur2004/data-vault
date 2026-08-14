# Database — Claude Code entry point

@AGENTS.md

## Claude Code specifics

- Skills auto-load from `.claude/skills/` — each is a pointer to the canonical skill in `skills/`; always follow the pointer and read the canonical file.
- Subagents in `.claude/agents/`: `architect` (use first, and for any spec/schema/planning question), `backend-builder`, `frontend-builder`, `qa-reviewer` (use proactively after every milestone).
- Commands: `/decisions` → `/plan` → `/build-module <bootstrap|auth|files|forms|sheets|documents|tasks|search|nfr>` → `/verify`.
- Start of any fresh session: re-read AGENTS.md and docs/DECISIONS.md before acting. If D-01 is Pending, nothing gets built.
