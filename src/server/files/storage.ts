import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { sign } from "./signing";

/**
 * The only module that touches stored files (§10.3).
 *
 * Files live on the **local filesystem**, under `storage/` in the project folder. That
 * directory is deliberately *not* `public/`: nothing serves it statically, so no URL
 * reaches a file directly.
 *
 * The guarantees BR-14 / AC-05 ask for are unchanged by storing them here:
 *   • no public URL exists at any time
 *   • every download goes through a link that expires in 300 seconds
 *   • that link is authorised per request before it is ever minted
 * The only difference from object storage is who signs the link — the app does, with
 * an HMAC covering the key, expiry, disposition, filename and content type
 * (see ./signing.ts). Tamper with any of them and the link stops working.
 *
 * Storage keys keep the shape they have always had — `<scope>s/<uuid>` — so they stay
 * non-guessable, non-sequential, and unrelated to the uploaded filename.
 */

/** BR-14 — five minutes. From the environment so it can never be quietly lengthened. */
export const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 300);

/** Where files live. A relative STORAGE_DIR resolves against the project root. */
export function storageRoot(): string {
  const configured = process.env.STORAGE_DIR ?? "storage";
  const root = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);

  // A file under public/ would be served to anyone who guessed the path, which is
  // exactly what BR-14 forbids. Refuse rather than store it there.
  const publicDir = resolve(process.cwd(), "public");
  if (root === publicDir || root.startsWith(publicDir + sep)) {
    throw new Error(
      `STORAGE_DIR must not be inside public/ — files there are served without authorisation, which breaks BR-14. Got: ${root}`,
    );
  }
  return root;
}

/**
 * Resolves a storage key to an absolute path, refusing anything that could escape the
 * root. Keys come from our own database, but a traversal bug here would expose the
 * whole disk, so a key is validated as strictly as user input.
 */
export function pathForKey(key: string): string {
  if (!key || key.includes("\0") || isAbsolute(key)) throw new Error("Invalid storage key.");
  if (!/^[a-z0-9][a-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key)) {
    throw new Error("Invalid storage key.");
  }

  const root = storageRoot();
  const full = resolve(root, key);
  if (full !== root && !full.startsWith(root + sep)) throw new Error("Invalid storage key.");
  return full;
}

export async function putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
  const full = pathForKey(key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, body);
}

export async function getObject(key: string): Promise<Buffer> {
  return readFile(pathForKey(key));
}

export async function deleteObject(key: string): Promise<void> {
  await rm(pathForKey(key), { force: true });
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    return (await stat(pathForKey(key))).isFile();
  } catch {
    return false;
  }
}

/** Storage is reachable when the root exists and is writable. */
export async function storageReachable(): Promise<boolean> {
  try {
    const root = storageRoot();
    await mkdir(root, { recursive: true });
    const probe = join(root, ".write-probe");
    await writeFile(probe, "ok");
    await rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** For the doctor's report and the storage check. Never shown to end users. */
export function describeStorage(): string {
  const root = storageRoot();
  return `${root}${existsSync(root) ? "" : " (will be created)"}`;
}

/**
 * A download link valid for exactly `SIGNED_URL_TTL` seconds.
 *
 * The caller must already have authorised the requester against the record that owns
 * this file — see ./authorize.ts. This mints the link; it does not decide who may
 * have one.
 *
 * Relative on purpose: it is served by this app, and a hardcoded host would break
 * behind a proxy or on a different port.
 */
export function signedDownloadUrl(opts: {
  key: string;
  filename: string;
  contentType: string;
  disposition?: "attachment" | "inline";
}): string {
  const disposition = opts.disposition ?? "attachment";
  const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL;

  const signature = sign({
    key: opts.key,
    expires,
    disposition,
    filename: opts.filename,
    contentType: opts.contentType,
  });

  const params = new URLSearchParams({
    k: opts.key,
    e: String(expires),
    d: disposition,
    n: opts.filename,
    t: opts.contentType,
    s: signature,
  });

  return `/api/files/download?${params.toString()}`;
}
