import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";

/**
 * Authentication (SPEC §5, D-01 = Option B, skills/auth-roles).
 *
 * Email + password only. **No public sign-up** — accounts come into existence solely
 * through an admin creating an Employee and that person using their invitation link
 * (§5.2). `disableSignUp` closes the endpoint at the framework level so there is no
 * route to defend.
 *
 * NFR-06 / BR-12: Better Auth hashes with scrypt by default. Overridden here with
 * Argon2id. The OWASP second-choice parameters (19 MiB, t=2, p=1) are the ones
 * skills/auth-roles specifies. Verify this is live by inspecting a stored hash —
 * it must begin `$argon2id$`.
 */

export const auth = betterAuth({
  appName: "Vault",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    password: {
      hash: (password: string) => hashPassword(password),
      verify: ({ password, hash: stored }: { password: string; hash: string }) =>
        verifyPassword(stored, password),
    },
  },

  user: {
    additionalFields: {
      // ADMIN | EMPLOYEE. `input: false` keeps it off every public payload, so no
      // client can self-assign a role through a sign-up or update call.
      role: {
        type: "string",
        required: true,
        defaultValue: "EMPLOYEE",
        input: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  advanced: {
    // HTTPS in production (NFR-06); plain http on localhost for dev.
    useSecureCookies: process.env.NODE_ENV === "production",
  },

  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
