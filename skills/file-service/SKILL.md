---
name: file-service
description: The shared file-handling module. Use this for anything involving uploads, downloads, previews, signed URLs, MIME/content validation, file size limits, filename sanitisation, versioning, MinIO/S3 configuration, or malware scanning — across Sheets, Documents, and task attachments. Build and consult this BEFORE building any section that stores files (SPEC §17 says file handling comes first).
---

# File service

One module, used by Sheets, Documents, and Task attachments. Implements SPEC.md §10.3, §6.7, BR-04, BR-14, AC-05/AC-06. Lives in `src/server/files/` — sections call it; they never talk to S3 directly.

## Storage

- S3-compatible client (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`). Dev = MinIO from `docker-compose.dev.yml` (console http://localhost:9001); prod = R2/S3. Config via `.env` (`S3_ENDPOINT`, `S3_BUCKET`, keys, `S3_FORCE_PATH_STYLE=true` for MinIO).
- **Private bucket. No public URL at any time.** Nothing under `public/`, no ACLs, no proxying raw keys to the client.
- `storageKey = <scope>/<uuid>` (e.g. `documents/6f2c…`). Non-guessable, non-sequential; the original filename never becomes part of the key.
- Original filename is sanitised (strip paths, control chars; cap 255) and stored on `StoredFile.originalFilename` for display and `Content-Disposition`.

## Upload pipeline (every upload, no exceptions)

1. **Size** — reject > `MAX_UPLOAD_MB` (25 MB, BR from D-09) before buffering the whole body where possible.
2. **Content inspection (BR-04/AC-06)** — detect the real type from magic bytes with the `file-type` package; the extension is a hint, never the verdict. Allowed types per context:
   - Sheets: `xlsx`, `xls`, `csv` (csv has no magic bytes — sniff: must parse as UTF-8/latin text with a consistent delimiter, reject if binary)
   - Documents: `pdf`, `docx`, `xlsx`
   - Task attachments: `pdf`, `docx`, `xlsx`, `pptx`, `png`, `jpg`, `txt` `[default — widen only via docs/DECISIONS.md]`
   A `.pdf` whose bytes aren't `%PDF` is rejected with a clear 422 message.
3. **Persist** — put to S3, then create `StoredFile` (mimeType from inspection, sizeBytes, uploadedBy) in the same request; on S3 failure nothing is written to the DB, on DB failure delete the object.
4. **Scan hook (§10.3)** — `scanStatus` starts `PENDING`. With `MALWARE_SCAN=off` (dev) mark `CLEAN` immediately; with `clamav`, stream through clamd and mark `CLEAN`/`REJECTED`. **Only `CLEAN` files are ever servable.** Rejected files are deleted from storage and surfaced to the uploader.
5. **Row counting (Sheets only, FR-S05/AC-04)** — on upload and on every replacement: xlsx/xls via `exceljs` (populated rows on the first worksheet, minus header row if present — count rows with ≥1 non-empty cell), csv via a streaming parse. Write `lastRecordCount` + `lastRecordCountAsOf = today`.

## Download / preview

- **Signed URLs only** (BR-14/AC-05): presigned GET, `expiresIn: Number(process.env.SIGNED_URL_TTL_SECONDS) // 300`, generated per request **after** an authorisation check on the owning record (see skills/auth-roles) and `scanStatus === CLEAN`.
- Set `ResponseContentDisposition: attachment; filename="<sanitised original>"` for downloads; `inline` + `application/pdf` for the PDF preview (FR-D05 — render in an `<iframe>`/`<object>` in a dialog).
- Never store a signed URL in the DB or cache it client-side beyond the immediate action.

## Versioning (FR-S06 / FR-D06)

Replace = upload new file through the full pipeline → new `StoredFile` with `version + 1`, `replacesId = old.id` → repoint the owning row's `fileId` in one transaction → write ActivityLog `replace_file`. Old versions are never deleted; an admin-only "versions" popover lists the chain with signed downloads. Recompute the sheet row count on replacement.

## Failure UX

Uploads fail loudly and specifically: too large (say the limit), wrong real type (say what was detected), scan rejected. Show progress for anything > 2 MB. Never leave an orphaned DB row pointing at a missing object — clean up on abort.
