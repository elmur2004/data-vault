import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { toHttpError, UnprocessableError } from "@/lib/errors";

/**
 * Route-handler plumbing.
 *
 * Route handlers and server actions are two doors into the *same* guarded services —
 * neither re-implements a rule. That matters for the acceptance criteria: AC-08,
 * AC-13 and AC-14 are all sent straight at the API precisely because the UI hides the
 * control, and the server has to refuse anyway.
 *
 * Error contract (skills/auth-roles): 401 unauthenticated · 403 unauthorised ·
 * 422 understood-and-refused · 404 missing · 500 anything unexpected, with no detail.
 */
export function handle<T>(fn: () => Promise<T>) {
  return fn().then(
    (data) =>
      NextResponse.json(data ?? { ok: true }, {
        headers: { "cache-control": "no-store" },
      }),
    (e: unknown) => {
      const { status, body } = toHttpError(e);
      if (status >= 500) console.error("[api]", e);
      return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
    },
  );
}

/** Field-level messages, so a form can show the error next to the input (AC-02). */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Parse or raise a 422 carrying field errors. */
export function parseOr422<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new UnprocessableError(
      "VALIDATION_FAILED",
      "Some fields need fixing.",
      fieldErrorsFrom(parsed.error),
    );
  }
  return parsed.data;
}

/** Accepts JSON or form-encoded bodies, so curl and the UI can use the same endpoint. */
export async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    return request.json().catch(() => ({}));
  }
  if (type.includes("form")) {
    const fd = await request.formData();
    return Object.fromEntries(fd.entries());
  }
  return request.json().catch(() => ({}));
}
