import "server-only";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { AppError, requireEnv } from "./config";

// An app-owned 1×1 PNG fixture; no uploads or arbitrary object keys are accepted.
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
  "base64",
);

export async function checkFoundation(ownerId: string) {
  if (
    process.env.APP_ENV !== "test" ||
    process.env.FOUNDATION_CHECK_ENABLED !== "true"
  ) {
    throw new AppError("configuration", 503);
  }
  const sql = neon(requireEnv("DATABASE_URL"));
  const endpoint = requireEnv("AWS_ENDPOINT_URL_S3");
  const bucket = requireEnv("STORAGE_BUCKET");
  if (requireEnv("AWS_REGION") !== "eu-central-1")
    throw new AppError("configuration", 503);
  const s3 = new S3Client({
    endpoint,
    region: "eu-central-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    maxAttempts: 2,
  });
  const id = randomUUID();
  const nonce = randomUUID();
  const key = `checks/${encodeURIComponent(ownerId)}/${id}.png`;
  const object = { Bucket: bucket, Key: key };
  let failed = false;
  let cleanupFailed = false;
  try {
    await sql`INSERT INTO foundation_checks (id, owner_id, nonce, image_key) VALUES (${id}, ${ownerId}, ${nonce}, ${key})`;
    const rows =
      await sql`SELECT nonce, image_key FROM foundation_checks WHERE id = ${id} AND owner_id = ${ownerId}`;
    if (
      rows.length !== 1 ||
      rows[0].nonce !== nonce ||
      rows[0].image_key !== key
    )
      throw new AppError("unavailable", 502);
    await s3.send(
      new PutObjectCommand({
        ...object,
        Body: image,
        ContentType: "image/png",
        CacheControl: "private, no-store",
      }),
    );
    const stored = await s3.send(new GetObjectCommand(object));
    const bytes = await stored.Body?.transformToByteArray();
    if (!bytes || !image.equals(Buffer.from(bytes)))
      throw new AppError("unavailable", 502);
    const publicUrl = new URL(
      `${encodeURIComponent(bucket)}/${key}`,
      `${endpoint}/`,
    );
    const publicResponse = await fetch(publicUrl, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    await publicResponse.body?.cancel();
    if (publicResponse.status !== 401 && publicResponse.status !== 403)
      throw new AppError("unavailable", 502);
  } catch {
    failed = true;
  } finally {
    // Attempt both cleanups even when upload, reads or the other cleanup fail.
    const cleaned = await Promise.allSettled([
      sql`DELETE FROM foundation_checks WHERE id = ${id} AND owner_id = ${ownerId}`,
      s3.send(new DeleteObjectCommand(object)),
    ]);
    cleanupFailed = cleaned.some((r) => r.status === "rejected");
  }
  if (cleanupFailed) {
    console.error("Foundation cleanup failed", { id });
    throw new AppError("cleanup", 502);
  }
  const remaining =
    await sql`SELECT id FROM foundation_checks WHERE id = ${id} AND owner_id = ${ownerId}`;
  if (remaining.length) throw new AppError("cleanup", 502);
  try {
    await s3.send(new HeadObjectCommand(object));
    throw new AppError("cleanup", 502);
  } catch (e) {
    if (!(
      e instanceof Error &&
      "$metadata" in e &&
      (e.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
    )) {
      throw new AppError("cleanup", 502);
    }
  }
  if (failed) throw new AppError("unavailable", 502);
  return {
    ok: true,
    database: "verified",
    privateImage: "verified",
    cleanup: "verified",
  };
}
