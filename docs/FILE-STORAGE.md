# File storage

Uploads are written to the **local filesystem**, in `storage/` inside the project.
There is no S3, no MinIO and no bucket.

```
storage/
├─ documents/<uuid>     Documents (FR-D02)
├─ sheets/<uuid>        Uploaded spreadsheets (FR-S02)
└─ attachments/<uuid>   Task result files (FR-T04)
```

`storage/` is gitignored. It holds real user data — contracts, employee records — so it
is never committed and never backed up into the repository.

## The rules this still has to satisfy

SPEC §10.3 and BR-14 / AC-05 do not say "use object storage". They say files are
**private**, have **no public URL at any time**, and are reachable **only through a
signed URL valid for 5 minutes, generated per request against the requester's
permissions**. All of that holds here:

| Requirement | How local storage satisfies it |
|---|---|
| No public URL, ever | `storage/` is deliberately **not** inside `public/`, so Next never serves it statically. The doctor and `npm run storage:init` both refuse a `STORAGE_DIR` under `public/`. |
| Authorised per request | `/api/files/[id]` authenticates the caller and checks they may see the record owning the file, exactly as before. Only then is a link minted. |
| Signed | The app signs it: an HMAC-SHA256 over the storage key, the expiry, the disposition, the filename **and the content type**. Change any one of them and the link stops working. Verified in constant time. |
| Expires in 5 minutes | `SIGNED_URL_TTL_SECONDS`, checked on every use. An expired link returns **410**. |
| Non-guessable keys | Unchanged: `<scope>s/<uuid>`, unrelated to the uploaded filename. |

The content type is signed for a specific reason: if it came from an unsigned query
parameter, a valid link could be re-pointed at a different rendering — inline
`text/html` being the obvious abuse.

## How a download actually happens

```
browser → GET /api/files/<storedFileId>
            authenticate → authorise against the owning record → check scanStatus
            → 307 redirect to
          GET /api/files/download?k=…&e=…&d=…&n=…&t=…&s=<hmac>
            verify expiry → verify signature → stream the bytes
```

The second URL carries no filesystem path, only the opaque key. Path traversal is
refused before a path is ever built: keys must match `<scope>/<name>`, and the resolved
path is asserted to sit inside the storage root.

## Configuration

```bash
STORAGE_DIR="storage"          # relative to the project root, or an absolute path
SIGNED_URL_TTL_SECONDS="300"   # BR-14 — five minutes
FILE_SIGNING_SECRET=""         # optional; falls back to BETTER_AUTH_SECRET
```

Changing `FILE_SIGNING_SECRET` or `BETTER_AUTH_SECRET` invalidates every link that is
currently open. They last five minutes, so that is a non-event.

## Verifying it

```bash
npm run storage:init                                              # is it private?
npx tsx --tsconfig tsconfig.scripts.json scripts/checks/storage.ts # download + preview, in a browser
npm test                                                          # 18 file-service tests
```

`scripts/checks/storage.ts` drives a real download and a real PDF preview through the
UI and asserts: the link expires in 300s, carries no filesystem path, serves the right
bytes with the original filename, works without a cookie until it expires, and is
refused the moment its content type is altered. Currently 12/12.

The integration suite additionally covers path traversal (`../.env`,
`documents/../../.env`, `/etc/passwd`), an expired link (410), and five separate
tamper cases.

## What this trades away

Honest about it: SPEC S-04 named object storage for production, and local disk has real
downsides for a hosted deployment — files live on the app server, so more than one
instance does not share them, and they are lost if the disk is. If Vault is ever
deployed behind more than one instance, or onto ephemeral storage, this decision needs
revisiting. `src/server/files/storage.ts` is the only module that touches storage, so
that change stays contained to one file.

Recorded as **DV-06** in `docs/DECISIONS.md`.

## Migrating from object storage

The files that already existed in MinIO were copied to disk before S3 was removed:
147 of 157 rows. The other 10 were phantom rows created by tests that never uploaded
bytes (the `scanStatus: PENDING` fixture), so nothing real was lost.
