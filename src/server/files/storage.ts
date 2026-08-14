import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * The only module that talks to object storage (§10.3, S-04).
 *
 * Private bucket. No object is ever public, and no raw key is ever handed to a
 * browser — access is exclusively through a presigned URL minted per request, after
 * an authorisation check, valid for 300 seconds (BR-14/AC-05).
 */

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET ?? "database-files";

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint,
  // MinIO needs path-style; R2/S3 do not care.
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

export const BUCKET = bucket;

/** BR-14 — five minutes, from the environment so it is never accidentally hardcoded longer. */
export const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 300);

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * A short-lived download URL. `disposition` decides whether the browser saves the
 * file or renders it — `inline` is what the PDF preview uses (FR-D05).
 *
 * Never stored in the database, never cached client-side beyond the immediate action.
 */
export async function signedDownloadUrl(opts: {
  key: string;
  filename: string;
  contentType: string;
  disposition?: "attachment" | "inline";
}): Promise<string> {
  const disposition = opts.disposition ?? "attachment";
  // RFC 5987 so non-ASCII names survive; the plain fallback stays quoted and escaped.
  const safeAscii = opts.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(opts.filename);

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: opts.key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: `${disposition}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`,
    }),
    { expiresIn: SIGNED_URL_TTL },
  );
}

export async function bucketReachable(): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return true;
  } catch {
    return false;
  }
}
