import { hash, verify } from "@node-rs/argon2";

/**
 * NFR-06 / BR-12 — Argon2id, one implementation.
 *
 * Both Better Auth's configured hasher and the activation flow (which creates the
 * credential account directly, because public sign-up is disabled) call these, so
 * there is exactly one place where password hashing parameters are decided.
 *
 * Parameters are OWASP's second recommended Argon2id configuration, as specified in
 * skills/auth-roles. Stated explicitly so a library default change cannot weaken them.
 *
 * Deliberately no `server-only` guard: prisma/seed.ts runs this in plain Node to create
 * the first admin (DF-01), and duplicating the parameters there would defeat the point
 * of having one place that decides them. Nothing here is a secret, and @node-rs/argon2
 * is a native module that cannot be bundled for the browser anyway.
 */
const ARGON2ID = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID);
}

export function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  return verify(storedHash, password);
}

/** Minimum length per skills/auth-roles. Never a pattern, never displayed (BR-12). */
export const MIN_PASSWORD_LENGTH = 10;
