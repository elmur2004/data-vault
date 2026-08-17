/**
 * Typed application errors.
 *
 * .agents/rules/10-stack.md: "errors are typed (Unauthorized→401, Forbidden→403,
 * Unprocessable→422)". Defined before any handler exists so no endpoint invents its
 * own contract. skills/auth-roles fixes the meanings:
 *
 *   401 — not signed in. Pages redirect to /login; API routes return JSON.
 *   403 — signed in but not allowed (BR-08 reopen, BR-09 cross-employee, BR-10 writes).
 *   422 — the request was understood and refused on a business rule (BR-05 the
 *         completion gate, BR-02 sheet exclusivity, BR-04 content inspection).
 *
 * Never leak whether a resource exists to someone who cannot see it: a scoped miss
 * raises Forbidden, not NotFound.
 */

export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RESULT_REQUIRED"
  | "SHEET_STORAGE_EXCLUSIVE"
  | "RECORD_COUNT_NEEDS_AS_OF"
  | "FILE_TYPE_REJECTED"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_CLEAN"
  | "INVALID_URL"
  | "VALIDATION_FAILED"
  | "INVITATION_INVALID"
  | "TASK_NOT_OPEN"
  | "CONFLICT";

export abstract class AppError extends Error {
  abstract readonly status: number;
  readonly code: AppErrorCode;
  /** Field-level messages, so forms can show the error next to the input (AC-02). */
  readonly fieldErrors?: Record<string, string>;

  constructor(code: AppErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export class UnauthorizedError extends AppError {
  readonly status = 401;
  constructor(message = "Sign in to continue.") {
    super("UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  constructor(message = "You do not have access to this.") {
    super("FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;
  constructor(message = "Not found.") {
    super("NOT_FOUND", message);
  }
}

/** 422 — understood, and refused on a business rule. */
export class UnprocessableError extends AppError {
  readonly status = 422;
  constructor(code: AppErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(code, message, fieldErrors);
  }
}

export class ConflictError extends AppError {
  readonly status = 409;
  constructor(message = "That conflicts with an existing record.") {
    super("CONFLICT", message);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Uniform JSON body for route handlers. The UI never depends on the prose. */
export function errorBody(e: AppError) {
  return {
    error: e.code,
    message: e.message,
    ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}),
  };
}

/**
 * Map any thrown value to an HTTP response shape. Unknown errors become a 500 with
 * no detail — internal messages never reach the client.
 */
export function toHttpError(e: unknown): { status: number; body: ReturnType<typeof errorBody> } {
  if (isAppError(e)) return { status: e.status, body: errorBody(e) };
  return {
    status: 500,
    body: {
      error: "VALIDATION_FAILED",
      message: "Something went wrong. Try again.",
      // In development the actual cause is included, because a generic 500 with no
      // detail is the hardest possible thing to debug. Never in production: an
      // internal message must not reach a client.
      ...(process.env.NODE_ENV !== "production"
        ? { detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
        : {}),
    },
  };
}
