---
name: auth-roles
description: Authentication and authorisation for the Database app. Use this for anything involving login, sessions, invitations, account activation, passwords, roles, the permission matrix, per-employee scoping, 401/403 handling, or middleware. Also use it when writing ANY server action or route handler, because every one of them must authorise.
---

# Auth & roles

Implements SPEC.md §3 (roles + permission matrix), §5 (employees, invitations, deactivation), BR-08..BR-13, NFR-06/07. Applies only if **D-01 = Option B** (employee accounts) — check `docs/DECISIONS.md` first. If D-01 resolves to Option A, this collapses to a single admin login and all scoping code is skipped.

## Setup (Better Auth)

- Email + password only. **Disable public sign-up** — accounts exist only via admin-created employees + invitation activation.
- **Argon2id** hashing (NFR-06): Better Auth's default is scrypt, so override `emailAndPassword.password.hash/verify` with `@node-rs/argon2` (`hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 })`, `verify(hash, pw)`).
- Extend the user model with `role: "ADMIN" | "EMPLOYEE"` (additional field, not user-settable through any public endpoint).
- Sessions: HTTP-only secure cookies, Better Auth defaults. All traffic HTTPS in production (NFR-06).
- Middleware guards every route except `/login`, `/activate/[token]`, and static assets.

## Invitation flow (§5.2)

1. Admin creates the Employee → server generates a random 256-bit token, stores **only its SHA-256 hash** in `Invitation` with `expiresAt = now + 7 days`, and emails `${APP_URL}/activate/<token>` via Nodemailer (Mailpit in dev — check http://localhost:8025).
2. `/activate/[token]`: hash the token, look it up; must be unused and unexpired, else show an expired screen with "ask your admin to re-invite".
3. Employee sets their own password (min 10 chars; zxcvbn-style feedback optional). Server creates the auth user with role `EMPLOYEE`, links `employee.userId`, marks `usedAt`, signs them in. **Single-use** — a second visit fails.
4. Admin can re-invite: revokes the old row, issues a new token. Passwords are never generated from a pattern, never displayed, never stored readable (BR-12).

## Authorisation — the only pattern allowed

Server-side on **every** endpoint and server action (NFR-07). The UI hiding a button is decoration, never enforcement.

```ts
// src/server/auth/guards.ts
export async function requireUser() {            // 401 → redirect to /login
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthorizedError();
  return session.user; // { id, role, employeeId? }
}
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ForbiddenError(); // → 403
  return user;
}
// Employees may act only on their own tasks (BR-09, AC-13):
export function scopeTasks(user: SessionUser) {
  return user.role === "ADMIN" ? {} : { employeeId: user.employeeId };
}
```

Rules of thumb:

- **Scoping happens in the query** (`where: { ...scopeTasks(user) }`), never by filtering after fetch — an employee's payload must not even contain other employees' tasks (AC-13).
- Fetching a single task: `findFirst({ where: { id, ...scopeTasks(user) } })`; a miss for a real id returns **403/404**, not the record.
- Mutations follow SPEC §3.1 exactly: employees can enter results and complete **their own** tasks; everything else (create/edit forms, sheets, documents, employees, tasks; archive; reopen; reassign) is `requireAdmin()`.
- Reopen is admin-only even for the task's own employee (BR-08, AC-14) → 403.
- Error contract: unauthenticated 401 (redirect in pages), unauthorised 403, validation 422. Never leak whether a resource exists to someone who cannot see it.

## Deactivation (§5.3, BR-13)

`isActive = false` on the Employee **and** revoke sessions / disable login on the linked user. The card disappears from default views; completed task history and late records remain. There is no employee delete path anywhere in the codebase.

## Test it like an attacker

Before calling auth done, run AC-13 and AC-14 from `docs/ACCEPTANCE.md` with raw fetch/curl using an employee session against another employee's task and against reopen — both must 403.
