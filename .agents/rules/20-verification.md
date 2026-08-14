# Verification rules

- A milestone is done only when: `npm run lint` and `npm run build` pass; its `AC-*` rows in @docs/ACCEPTANCE.md pass including the direct-API negative tests (AC-08 422, AC-13/AC-14 403, AC-06 content rejection); the flows were exercised in a real browser; empty states exist (§10.4).
- Produce a walkthrough artifact per milestone: what was built, spec IDs covered, screenshots (desktop + 375px for UI milestones), and the AC evidence table.
- Write unit tests for pure logic that guards an invariant — at minimum `computeLateness` (AC-10, AC-11, midnight and UTC-vs-Cairo boundaries) and the upload content-inspection allowlists.
- Never mark an AC passed from reading the code. Run it.
- Before the final handoff, run the full checklist in docs/ACCEPTANCE.md and report `AC | pass/fail | evidence`.
