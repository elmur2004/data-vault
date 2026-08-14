# Starting prompt

Open this folder as the workspace in **Antigravity** (Agent Manager → new agent) or start **Claude Code** inside it, then paste the prompt below.

---

## Main prompt (copy from here)

```
You are the lead engineer for the "Database" web app. This workspace is your full briefing — do not invent requirements.

Phase 0 — Orient (before any code):
1. Read AGENTS.md (operating manual), then SPEC.md end to end, then every skill under skills/ (spec-navigator, data-model, auth-roles, file-service, task-rules, ui-design), then docs/DECISIONS.md and docs/ACCEPTANCE.md.
2. SPEC.md §16 lists open decisions D-01..D-10. Walk me through each one with the spec's recommendation and wait for my answers. D-01 (employee accounts vs single user) blocks everything — do not proceed past it without my explicit answer. Record my answers in docs/DECISIONS.md.

Phase 1 — Plan:
3. Produce an implementation plan as an artifact: the milestones M0–M9 from AGENTS.md, each with scope, the FR/BR IDs it covers, and the AC items from docs/ACCEPTANCE.md that prove it done. List risks and anything ambiguous.
4. Stop and wait for my approval of the plan.

Phase 2 — Build (after approval), one milestone at a time:
5. Implement the milestone. Re-read the matching skill before touching its area.
6. After each milestone: run lint + build, verify the flows in a real browser, and show me a short walkthrough (screenshots) before moving on.
7. Never violate the invariants in AGENTS.md — especially: the server-side completion gate (422 without a result), server-stamped completion time, frozen lateness after completion, admin-only reopen, employee query-layer scoping (403), archival instead of deletion, and 5-minute signed URLs.

Phase 3 — Verify:
8. Run the full checklist in docs/ACCEPTANCE.md (AC-01..AC-17), including the direct-API negative tests, and report pass/fail per item with evidence.
```

---

## Fast variant (I trust the spec's recommendations)

```
Read AGENTS.md, SPEC.md, all skills under skills/, and docs/. Adopt every recommendation in SPEC.md §16 (Option B employee accounts, date-only deadlines, optional document descriptions, the §6.1 document-type list, tasks carry a company tag) and mark them Adopted in docs/DECISIONS.md. Then follow the plan → build → verify flow in AGENTS.md, milestone by milestone, pausing only at the plan for my approval and after each milestone with a browser-verified walkthrough. Finish with a full docs/ACCEPTANCE.md run.
```

---

## Per-role prompts (parallel agents)

To split the work across several Antigravity agents, spawn one agent per brief in `agents/` — start with `agents/01-architect.md` and paste its contents as that agent's first message. See `agents/README.md` for the handoff order.

## Slash shortcuts

Antigravity workflows (also available as Claude Code commands): `/decisions`, `/plan`, `/build-module <name>`, `/verify`.
