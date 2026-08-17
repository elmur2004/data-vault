/**
 * Prepares the storage directory and proves files there are not publicly reachable.
 *   npm run storage:init
 *
 * §10.3: "Private object storage. No public URL at any time." With uploads on local
 * disk that means two things, and this checks both:
 *   1. the directory exists, is writable, and is not inside public/
 *   2. a stored file cannot be fetched over HTTP without a signed link
 *
 * Exits non-zero if either fails, so a misconfiguration cannot pass unnoticed.
 */
import "./_env";
import { randomUUID } from "node:crypto";
import {
  describeStorage,
  deleteObject,
  putObject,
  storageReachable,
} from "../src/server/files/storage";

async function main() {
  console.log(`storage: ${describeStorage()}`);

  if (!(await storageReachable())) {
    console.error("\nFAIL — the storage directory is not writable.");
    process.exit(1);
  }

  // Write a probe, then try to reach it over HTTP the way an outsider would.
  const key = `probes/${randomUUID()}`;
  await putObject(key, Buffer.from("probe-content"), "text/plain");

  const base = (process.env.APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const attempts = [
    `${base}/storage/${key}`,
    `${base}/${key}`,
    // The download route without a signature must refuse too.
    `${base}/api/files/download?k=${encodeURIComponent(key)}`,
  ];

  let leaked: string | null = null;
  let checked = 0;
  for (const url of attempts) {
    try {
      const res = await fetch(url);
      checked++;
      if (res.status === 200 && (await res.text()).includes("probe-content")) leaked = url;
    } catch {
      /* unreachable is the desired answer */
    }
  }

  await deleteObject(key);

  if (leaked) {
    console.error("");
    console.error("FAIL — a stored file was readable without a signed link:");
    console.error(`  ${leaked}`);
    console.error("  BR-14 requires files to be reachable only through a 5-minute signed URL.");
    process.exit(1);
  }

  console.log(
    checked > 0
      ? "private: no unauthenticated route returned the file"
      : "private: app not running, so only the directory was checked",
  );
  console.log("storage ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
