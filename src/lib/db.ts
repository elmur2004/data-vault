import { PrismaClient } from "@prisma/client";

/**
 * The database client.
 *
 * Two jobs beyond "give me a client":
 *
 * 1. **One client per process.** Next dev reloads modules on every edit, so without
 *    the global cache each reload opens a fresh pool and Postgres runs out of
 *    connections.
 *
 * 2. **Survive a blip.** A brief loss of the database — a restart, a laptop waking,
 *    a connection reaped mid-request — should not take a page down. Transient
 *    connection errors are retried with backoff instead of propagating, so the app
 *    recovers on its own rather than needing a restart.
 *
 *    Only *connection* failures are retried. A constraint violation, a 422, or any
 *    business error is returned immediately and untouched — retrying those would
 *    hide real bugs, and re-running a write that already succeeded would be worse
 *    than failing.
 */

/** Prisma error codes that mean "the database was unreachable", not "you were wrong". */
const TRANSIENT = new Set([
  "P1001", // can't reach database server
  "P1002", // database server timed out
  "P1008", // operation timed out
  "P1017", // server closed the connection
  "P2024", // timed out fetching a connection from the pool
]);

function isTransient(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT.has(code)) return true;
  // Socket-level failures surface before Prisma assigns a code.
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    /ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|Connection (refused|reset|closed)|server has closed the connection/i.test(
      message,
    )
  );
}

const RETRY_DELAYS_MS = [150, 400, 900, 1800];

function base() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function build() {
  return base().$extends({
    query: {
      async $allOperations({ args, query, model, operation }) {
        let lastError: unknown;
        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            if (!isTransient(error)) throw error;
            lastError = error;
            const delay = RETRY_DELAYS_MS[attempt];
            if (delay === undefined) break;
            console.warn(
              `[db] ${model ?? "raw"}.${operation} — database unreachable, retrying in ${delay}ms`,
            );
            await new Promise((r) => setTimeout(r, delay));
          }
        }
        throw lastError;
      },
    },
  });
}

type ResilientClient = ReturnType<typeof build>;

/**
 * The client type, and the transaction client it hands to `$transaction` callbacks.
 *
 * An extended client is not a `PrismaClient`, so `Prisma.TransactionClient` no longer
 * describes what a transaction callback receives. Services take `AnyDb` so they can be
 * called with either the shared client or a transaction, which is what lets a change
 * and its ActivityLog entry commit together.
 */
export type DbClient = ResilientClient;
export type TxClient = Omit<
  ResilientClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
export type AnyDb = DbClient | TxClient;

const globalForPrisma = globalThis as unknown as { prisma?: ResilientClient };

export const db: ResilientClient = globalForPrisma.prisma ?? build();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * Waits for the database to accept queries. Used by the bootstrap check so a freshly
 * started Postgres is given a moment rather than failing the whole run.
 */
export async function waitForDatabase(timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await db.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      if (Date.now() >= deadline || !isTransient(error)) return false;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
