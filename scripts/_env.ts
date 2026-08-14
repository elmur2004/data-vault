/**
 * Loads .env for scripts run through tsx.
 *
 * Next loads .env itself, and Prisma loads it for DATABASE_URL, but a plain Node
 * script gets neither — which is why an unconfigured S3 client happily tried to reach
 * amazonaws.com instead of the local MinIO.
 *
 * Import this FIRST in any script that reads process.env at module scope.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  // Node 20.6+ / 22 built-in; no dependency needed.
  process.loadEnvFile(envPath);
}

export {};
