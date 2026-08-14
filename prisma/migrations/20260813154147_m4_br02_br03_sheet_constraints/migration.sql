-- BR-02 / AC-03: a sheet has exactly one of a URL or an uploaded file, never both and
-- never neither. Enforced in zod and re-checked in the server action; this is the
-- belt-and-braces layer skills/data-model calls for, so no code path can violate it.
ALTER TABLE "Sheet"
  ADD CONSTRAINT "sheet_storage_exclusive" CHECK (
    ("storageMode" = 'LINK' AND "url" IS NOT NULL AND "fileId" IS NULL)
    OR
    ("storageMode" = 'FILE' AND "fileId" IS NOT NULL AND "url" IS NULL)
  );

-- BR-03: a record count entered by hand is meaningless without its as-of date.
-- §6.3.1 — "A count of 1,240 as of 12 July is useful. A bare 1,240 is not."
ALTER TABLE "Sheet"
  ADD CONSTRAINT "sheet_record_count_needs_as_of" CHECK (
    "lastRecordCount" IS NULL OR "lastRecordCountAsOf" IS NOT NULL
  );