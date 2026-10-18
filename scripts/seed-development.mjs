import { readFile, readdir, stat } from "node:fs/promises";
import { Client } from "pg";
import { createHash } from "node:crypto";
import { validateHistory } from "./migration-history.mjs";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  verifyDatabaseTarget,
  verifyStorageTarget,
} from "./environment-target.mjs";

let database, storage;
try {
  if (!["development", "preview"].includes(process.env.APP_ENV))
    throw new Error("Nonproduction target required");
  const file =
    process.env.REFERENCE_DATA_FILE ?? ".env.reference.local/reference.json";
  const info = await stat(file);
  if (info.size > 16384 || info.mode & 0o077)
    throw new Error("Reference file must be small and private");
  const reference = JSON.parse(await readFile(file, "utf8"));
  if (
    !process.env.OWNER_USER_ID ||
    reference.ownerId !== process.env.OWNER_USER_ID
  )
    throw new Error("Reference owner verification failed");
  const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
  if (
    reference.version !== 1 ||
    !uuid.test(reference.id) ||
    !uuid.test(reference.nonce) ||
    reference.sourceAuthUrl !== process.env.NEON_AUTH_BASE_URL
  )
    throw new Error("Reference identity or format verification failed");
  const image = Buffer.from(reference.image, "base64");
  if (
    image.length !== 68 ||
    image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    throw new Error("Reference image verification failed");
  const target = verifyStorageTarget();
  database = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  await database.connect();
  await verifyDatabaseTarget(database, "runtime");
  // Complete history validation precedes the first data or image write.
  const files = [];
  for (const name of (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const source = await readFile(
      new URL(`../migrations/${name}`, import.meta.url),
    );
    files.push({
      name,
      checksum: createHash("sha256").update(source).digest("hex"),
    });
  }
  const { rows: applied } = await database.query(
    "SELECT name,checksum FROM schema_migrations ORDER BY name",
  );
  validateHistory(files, applied, true);
  const key = `reference/${encodeURIComponent(reference.ownerId)}/${reference.id}.png`;
  const checkOnly = process.argv.includes("--check");
  const values = [reference.id, reference.ownerId, reference.nonce, key];
  const { rows } = await database.query(
    "SELECT owner_id,nonce,image_key FROM foundation_checks WHERE id=$1",
    [reference.id],
  );
  if (checkOnly && !rows.length) throw new Error("Reference data is missing");
  if (
    rows.length &&
    (rows[0].owner_id !== reference.ownerId ||
      rows[0].nonce !== reference.nonce ||
      rows[0].image_key !== key)
  )
    throw new Error(
      "Reference conflicts with existing data; nothing overwritten",
    );
  storage = new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    region: target.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    maxAttempts: 2,
  });
  const object = { Bucket: target.bucket, Key: key };
  try {
    const stored = await storage.send(new GetObjectCommand(object));
    const bytes = await stored.Body.transformToByteArray();
    if (!image.equals(Buffer.from(bytes)))
      throw new Error(
        "Reference conflicts with existing image; nothing overwritten",
      );
  } catch (error) {
    if (checkOnly || error.$metadata?.httpStatusCode !== 404) throw error;
    await storage.send(
      new PutObjectCommand({
        ...object,
        Body: image,
        ContentType: "image/png",
        CacheControl: "private, no-store",
        IfNoneMatch: "*",
      }),
    );
  }
  if (!checkOnly)
    await database.query(
      "INSERT INTO foundation_checks(id,owner_id,nonce,image_key) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
      values,
    );
  console.log(
    "Saved nonproduction reference verified; existing data and images preserved.",
  );
} catch (error) {
  console.error(
    "Reference bootstrap failed:",
    error.message?.startsWith("Reference") || error.message?.includes("target")
      ? error.message
      : (error.code ?? error.name),
  );
  process.exitCode = 1;
} finally {
  await database?.end();
  storage?.destroy();
}
