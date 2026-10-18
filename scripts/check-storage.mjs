import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { verifyStorageTarget } from "./environment-target.mjs";
try {
  const target = verifyStorageTarget();
  const client = new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    region: target.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
  });
  await client.send(new HeadBucketCommand({ Bucket: target.bucket }));
  client.destroy();
  console.log("Private storage target and branch-scoped credential verified.");
} catch (error) {
  console.error(
    "Storage check failed:",
    error.message?.includes("target") ? error.message : error.name,
  );
  process.exitCode = 1;
}
