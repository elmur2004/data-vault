# Stack & repository conventions

- Stack is fixed by docs/DECISIONS.md S-01..S-09: Next.js App Router + TypeScript strict, PostgreSQL 16 + Prisma, Better Auth (Argon2id), S3/MinIO with 300s presigned URLs, Tailwind v4 + shadcn/ui + TanStack Table, next-intl (en), Nodemailer→Mailpit. Do not swap libraries without human approval.
- Target layout: `src/app` (routes), `src/components` (ui/, layout/, per-module), `src/server` (auth/, files/, tasks/, activity/, per-module actions), `src/lib` (db, validation, i18n, utils), `prisma/`, `brand/` assets copied into the app, `docker-compose.dev.yml` for services.
- Every mutation: zod-validated input → auth guard (skills/auth-roles) → transaction → ActivityLog entry. No mutation skips any of the four.
- All timestamps stored UTC; format to Africa/Cairo only in the UI (BR-15). All UI strings via the next-intl catalog (NFR-10).
- Dev services: `docker compose -f docker-compose.dev.yml up -d` (postgres :5432, MinIO :9000/:9001, Mailpit :8025). Secrets only in `.env` (never committed); `.env.example` is the contract.
- TypeScript: no `any` in `src/server`; errors are typed (Unauthorized→401, Forbidden→403, Unprocessable→422).
