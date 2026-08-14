# Agent mission briefs

These are paste-ready first messages for spawning role agents in Antigravity's Agent Manager (they work in any coding agent). They complement — not replace — the native configs: Antigravity reads `AGENTS.md` + `.agents/`, Claude Code reads `CLAUDE.md` + `.claude/` (where the same four roles exist as subagents).

Handoff order:

1. `01-architect.md` — decisions (D-01 first) + PLAN.md + schema. Human approves the plan.
2. `02-backend.md` — M0–M2 foundations, then the server side of each module in order.
3. `03-frontend.md` — shell + each module's UI as its backend lands.
4. `04-qa.md` — after every milestone and before handoff.

Running them in parallel: backend and frontend can overlap per module once the architect's plan is approved and M0–M2 exist; QA runs continuously. Each agent leaves walkthrough artifacts so the next one has context.
