---
description: Run the full acceptance checklist and report evidence
---
# /verify

1. Read docs/ACCEPTANCE.md.
2. Start the app and dev services; seed data if the DB is empty (prisma/seed).
3. Execute AC-01..AC-17 in order, using the browser for UI checks and direct curl/fetch for the API negative tests (AC-03, AC-06, AC-08, AC-13, AC-14). Then run the Musts sweep.
4. Produce the report table `AC | pass/fail | evidence` as an artifact, with screenshots for UI items and response codes for API items.
5. For any failure: fix, then re-run that item plus AC-08 and AC-13 before reporting done.
