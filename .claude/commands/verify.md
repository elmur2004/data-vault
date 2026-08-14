---
description: Run the full acceptance checklist (AC-01..AC-17 + Musts sweep) and report evidence
---
Read docs/ACCEPTANCE.md. Start dev services and the app; seed if empty. Execute AC-01..AC-17 in order — browser for UI checks, direct curl/fetch for the API negative tests (AC-03, AC-06, AC-08, AC-13, AC-14) — then the Musts sweep. Produce the table `AC | pass/fail | evidence`. For failures: fix, re-run the failed item plus AC-08 and AC-13, and only then report done. $ARGUMENTS
