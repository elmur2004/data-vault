# Self-healing

A new push should never leave anybody with a broken checkout, and nothing here should
ever need a database restart to recover. One command does the work:

```bash
npm run doctor
```

It runs automatically before `npm run dev` and `npm run start`, and after every
`git pull` or branch switch once the hooks are installed:

```bash
npm run hooks:install     # once per clone
```

## What it guarantees

| Step | What it does | If it is already fine |
|---|---|---|
| **environment** | Creates `.env` if missing, generates the auth and cron secrets, adds any key that was added upstream, and pins the admin credentials. Values you changed are kept. | untouched |
| **services** | Starts Postgres and Mailpit - **only the ones that are not already listening**. | untouched |
| **database** | Creates the database if it does not exist. | untouched |
| **migrations** | Applies pending migrations with `prisma migrate deploy`. | untouched |
| **prisma client** | Regenerates only when the schema is newer than the generated client. | untouched |
| **file storage** | Creates the `storage/` directory if missing, and refuses one inside `public/`. | untouched |
| **admin account** | Guarantees `admin@byteforce.com` / `password123` exists and works. | untouched, and **no sessions are revoked** |

Run it twice and the second run reports "Everything was already healthy."

## What it will never do

These are the guarantees that make it safe to run automatically:

- **It never restarts Postgres.** A running database is left alone. Verified by
  comparing `pg_postmaster_start_time()` before and after a heal.
- **It never resets or drops anything.** `migrate deploy`, never `migrate reset`. No
  dropped database, no truncated tables, no deleted rows.
- **It never signs you out unnecessarily.** The admin password is only rewritten if the
  expected one does not already verify; sessions are revoked only when it actually
  changed.
- **It never replaces the admin.** An admin found under a different address is
  *renamed*, so its id survives and every ActivityLog entry attributing work to it stays
  attached.
- **It never fights a running process.** If a dev server holds the Prisma engine open,
  regeneration is reported as skipped rather than failing the run.

## The admin account

Fixed, deliberately, so a clone or a rebuilt database never leaves anyone locked out:

```
admin@byteforce.com
password123
```

Both live in `.env` (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`) and the doctor re-pins
them on every run. It still enforces the app's 10-character minimum, so this path cannot
set something the sign-in form would reject, and the digest is Argon2id like any other
password - nothing is stored readable (BR-12/NFR-06).

**Before any real deployment, change both.** In production the doctor refuses to set a
fixed password unless `ALLOW_FIXED_ADMIN_PASSWORD=1` is set explicitly, so this cannot
be shipped by accident.

## Surviving a database blip

`src/lib/db.ts` retries transient connection failures (`P1001`, `P1002`, `P1008`,
`P1017`, `P2024`, and socket-level resets) with backoff, so a database restart, a
laptop waking, or a reaped connection recovers on its own instead of taking a page
down. Only connection failures are retried - a constraint violation or a 422 is
returned immediately, because retrying those would hide real bugs and could re-run a
write that already succeeded.

## Proving it

```bash
npx tsx --tsconfig tsconfig.scripts.json scripts/checks/self-heal.ts
```

Breaks the environment on purpose - stops Mailpit, renames the admin, corrupts
its password hash - heals it, then asserts everything came back, Postgres was never
restarted, no data was lost, and a second run is a no-op. Currently 9/9.

## On every push

`.github/workflows/ci.yml` runs the same routine against real Postgres and Mailpit
containers, then lint, typecheck, 139 tests, the build, the direct-API negatives
and the browser acceptance criteria. If the doctor cannot heal a clean checkout, CI
fails - which is the point: nobody should discover that by pulling.
