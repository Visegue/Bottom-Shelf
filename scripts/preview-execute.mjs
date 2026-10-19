// Trusted executor: only the fixed preview's scoped credentials enter this container.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  verifyDatabaseTarget,
  verifyStorageTarget,
} from "./environment-target.mjs";
const input = JSON.parse(process.env.PREVIEW_INPUT);
function run(args, env) {
  const result = spawnSync(process.execPath, args, {
    cwd: resolve("candidate"),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  if (result.error || result.status !== 0)
    throw new Error("Scoped preview command failed");
}
try {
  const client = new Client({
    connectionString: input.migration.DATABASE_MIGRATION_URL,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    await verifyDatabaseTarget(client, "migrator", input.migration);
    verifyStorageTarget(input.runtime);
  } finally {
    await client.end();
  }
  run(["scripts/migrate.mjs"], input.migration);
  run(["scripts/check-database.mjs"], input.runtime);
  run(["scripts/check-storage.mjs"], input.runtime);
  console.log(
    "Shared preview migrations and scoped database/storage checks passed; existing data preserved.",
  );
} catch {
  console.error(
    "Preview migration or connection check failed; private output withheld. Deployment stopped.",
  );
  process.exitCode = 1;
}
