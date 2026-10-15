import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
if (
  project.projectId !== "prj_9mmJV4XIqdZyvhtpwh2amkiQS2k6" ||
  process.env.APP_ENV !== "test"
) {
  throw new Error(
    "Only the linked isolated test project may receive this configuration",
  );
}
const names = [
  "DATABASE_URL",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "AWS_ENDPOINT_URL_S3",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "STORAGE_BUCKET",
  "APP_ENV",
  "FOUNDATION_CHECK_ENABLED",
];
const sensitive = new Set([
  "DATABASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "OWNER_EMAIL",
  "OWNER_USER_ID",
]);
for (const name of ["OWNER_EMAIL", "OWNER_USER_ID"])
  if (process.env[name]) names.push(name);
for (const name of names) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing locally`);
  const args = [
    "env",
    "add",
    name,
    "production",
    "--scope",
    "visegue",
    "--yes",
    "--force",
    ...(sensitive.has(name) ? ["--sensitive"] : ["--no-sensitive"]),
  ];
  const result = spawnSync("vercel", args, { input: value, encoding: "utf8" });
  if (result.error || result.status !== 0)
    throw new Error(
      `${name} could not be configured; inspect Vercel without printing its value`,
    );
  console.log(`${name}: configured`);
}
// DATABASE_MIGRATION_URL is intentionally never transferred to the app host.
