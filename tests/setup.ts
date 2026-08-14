import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Next and Prisma each load .env themselves; vitest does not. Integration tests talk
 * to the real MinIO and Postgres, so without this an unconfigured S3 client quietly
 * tries to reach amazonaws.com.
 */
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
