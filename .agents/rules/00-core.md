# Core rules — always on

- At the start of every session, read @AGENTS.md. It is the operating manual; SPEC.md is the source of requirements.
- Before touching an area, read its skill (see the table in AGENTS.md). Skills live in `skills/` with pointer stubs in `.agents/skills/`.
- Check `docs/DECISIONS.md` before building anything a D-01..D-10 decision gates. If a needed decision is Pending, stop and ask the human. Never assume D-01.
- Cite spec IDs (FR-*, BR-*, AC-*) when explaining implementation choices, in commit messages, and in walkthroughs.
- Plan before code. Small, verifiable steps. After each milestone: lint + build green, browser-verified, short walkthrough artifact with screenshots.
- Never violate the invariants list in AGENTS.md (completion gate 422, server-stamped completion, frozen lateness, admin-only reopen, employee scoping 403, archival not deletion, 5-minute signed URLs, content-inspected uploads, Argon2id).
- Anything in SPEC.md §15 (out of scope) is a hard no unless the human changes the spec.
