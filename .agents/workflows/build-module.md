---
description: Build one milestone/module end to end (bootstrap | auth | files | forms | sheets | documents | tasks | search | nfr)
---
# /build-module

Input: the milestone or module name.

1. Re-read the matching skill(s) from the table in AGENTS.md, plus the SPEC sections and FR list for that module (skills/spec-navigator has the map).
2. Confirm prerequisites are built (AGENTS.md build order — e.g. the file service before Sheets/Documents/Tasks attachments).
3. Implement: schema/migration if needed → server actions with zod + auth guards + ActivityLog → UI per skills/ui-design, including the empty state.
4. Verify: lint + build; run this module's AC rows and Musts-sweep items from docs/ACCEPTANCE.md, including negative API tests; exercise in the browser at desktop and 375px.
5. Produce a short walkthrough artifact (screenshots + AC evidence) and stop for review before the next milestone.
