---
description: Build one milestone end to end (bootstrap | auth | files | forms | sheets | documents | tasks | search | nfr)
argument-hint: bootstrap | auth | files | forms | sheets | documents | tasks | search | nfr
---
Target milestone: $ARGUMENTS

1. Re-read the matching skill(s) from the table in AGENTS.md plus the SPEC sections/FR list for this module (skills/spec-navigator maps them).
2. Confirm prerequisites per the AGENTS.md build order (file service before Sheets/Documents/task attachments).
3. Implement: schema/migration if needed → server actions with zod validation + auth guards + ActivityLog → UI per skills/ui-design including the empty state.
4. Verify: npm run lint && npm run build; run this module's AC rows and Musts-sweep items from docs/ACCEPTANCE.md including the negative direct-API tests; check the browser at desktop and 375px widths.
5. Report a short walkthrough (what was built, spec IDs covered, AC evidence) and stop for review.
