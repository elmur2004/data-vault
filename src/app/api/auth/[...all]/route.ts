import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * Better Auth's endpoints (sign in, sign out, session). Sign-up is disabled in the
 * config, so /api/auth/sign-up-email returns an error rather than creating anything
 * (§5.2 — accounts exist only via admin-created employees and invitation activation).
 */
export const { GET, POST } = toNextJsHandler(auth);
