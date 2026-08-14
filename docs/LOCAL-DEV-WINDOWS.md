# Local development on Windows, without Docker

`docker-compose.dev.yml` and `.env.example` remain the canonical contract. This file
records how the same three services were brought up on a machine where **Docker is not
installed**, and which ports had to change as a result.

Nothing about the application depends on this document — it is operational only.

## Why the ports differ

| Service | docker-compose | Here | Why |
|---|---|---|---|
| Postgres | 5432 | **55432** | 5432 is the machine's own `postgresql-x64-17` service; 5433 is an embedded Postgres belonging to `D:\CRM`. An isolated cluster on a free high port keeps both untouched. |
| MinIO API | 9000 | 9000 | free |
| MinIO console | 9001 | 9001 | free |
| Mailpit SMTP | 1025 | 1025 | free |
| Mailpit UI | 8025 | 8025 | free |
| Next.js dev | 3000 | **3001** | 3000 is held by another Node dev server on this machine. |

Postgres is **17.9** rather than the 16 named in S-02, because the binaries were already
present. Prisma targets both identically and the app uses no version-specific feature.

## What runs where

```
.devservices/
├─ pgdata/            isolated Postgres cluster (initdb'd here, superuser `postgres`)
├─ miniodata/         MinIO object store
├─ minio.exe          standalone server binary
├─ mailpit.exe        standalone server binary
├─ mailpit.db         Mailpit message store
├─ logs/              postgres.log, minio.out, mailpit.out
├─ start-minio.cmd    launcher (absolute paths: NoDefaultCurrentDirectoryInExePath is set here)
├─ start-mailpit.cmd  launcher
└─ services.ps1       start | stop | status
```

The whole directory is gitignored. Deleting it and re-running the steps below rebuilds
the environment from scratch.

## Commands

```bash
npm run services:start    # postgres + minio + mailpit
npm run services:status   # port-by-port table
npm run services:stop     # stops only this project's processes
npm run dev               # http://localhost:3001
```

`services:stop` targets the cluster by data directory and matches MinIO/Mailpit by
executable path, so it can never stop another project's database.

## First-time setup (already done, recorded for reproducibility)

```powershell
# 1. Isolated Postgres cluster using the installed PG17 binaries
& "C:\Program Files\PostgreSQL\17\bin\initdb.exe" -D .devservices\pgdata -U postgres `
    --pwfile=<temp file containing the password> --auth-host=scram-sha-256 -E UTF8
# then set `port = 55432` and `listen_addresses = '127.0.0.1'` in pgdata\postgresql.conf
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D .devservices\pgdata -l .devservices\logs\postgres.log start
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -w -U postgres -h 127.0.0.1 -p 55432 -c "CREATE DATABASE database_app;"

# 2. Standalone service binaries
#    https://dl.min.io/server/minio/release/windows-amd64/minio.exe
#    https://github.com/axllent/mailpit/releases/latest/download/mailpit-windows-amd64.zip

# 3. Object storage bucket
npm run storage:init
```

## Gotchas hit along the way

- `pg_ctl -w` probes the port from `postgresql.conf`, not the one passed via `-o "-p …"`.
  Write the port into the config file instead, or the wait never succeeds.
- `psql` blocks forever on a password prompt in a non-interactive shell. Always pass `-w`.
- 8.3 short names are disabled on `D:`, so paths containing spaces cannot be worked around
  that way — the `.cmd` launchers quote `%~dp0` instead.
- `NoDefaultCurrentDirectoryInExePath` is set in this environment, so a `.cmd` that does
  `cd /d "%~dp0"` still cannot run `minio.exe` by bare name. The launchers use `"%~dp0minio.exe"`.
- `Start-Process -RedirectStandardOutput` resolves relative paths against the shell's
  working directory, not `-WorkingDirectory`. The launchers redirect inside the `.cmd`.

## Moving to Docker later

Nothing in `src/` knows about any of this. Start the compose stack, point `DATABASE_URL`
at 5432 and `APP_URL` at 3000 in `.env`, and delete `.devservices/`.
