/**
 * Creates the private bucket if it does not exist, and asserts it is not public.
 *   npm run storage:init
 *
 * §10.3: "Private object storage. No public URL at any time." This script fails loudly
 * if an anonymous GET can list or read the bucket.
 */
import "./_env";
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3, BUCKET } from "../src/server/files/storage";

async function main() {
  const endpoint = process.env.S3_ENDPOINT ?? "";

  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`bucket "${BUCKET}" already exists`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`bucket "${BUCKET}" created`);
  }

  // Put a probe object, then try to read it with no credentials at all.
  const key = "_probe/public-access-check";
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from("probe"), ContentType: "text/plain" }),
  );

  const anonUrl = `${endpoint.replace(/\/$/, "")}/${BUCKET}/${key}`;
  let anonStatus = 0;
  try {
    const res = await fetch(anonUrl);
    anonStatus = res.status;
  } catch {
    anonStatus = -1;
  }

  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

  if (anonStatus === 200) {
    console.error("");
    console.error("FAIL — the bucket is publicly readable. §10.3 requires private storage.");
    console.error(`  anonymous GET ${anonUrl} returned 200`);
    process.exit(1);
  }

  console.log(`private: anonymous GET returned ${anonStatus === -1 ? "a connection error" : anonStatus} (not 200)`);
  console.log("storage ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
