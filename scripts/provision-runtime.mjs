import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { parseEnv } from "node:util";

if (process.env.APP_ENV !== "test")
  throw new Error("Only isolated test provisioning is supported");
if (!process.env.DATABASE_MIGRATION_URL)
  throw new Error("DATABASE_MIGRATION_URL is required");
const file = ".env.local";
const pendingFile = ".env.local.runtime-pending";
const env = parseEnv(await readFile(file, "utf8"));
let pending;
try {
  pending = parseEnv(await readFile(pendingFile, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const owner = new URL(process.env.DATABASE_MIGRATION_URL);
if (owner.hostname.includes("-pooler"))
  throw new Error("Use a direct migration connection");
owner.searchParams.set("sslmode", "verify-full");
const client = new Client({
  connectionString: owner.toString(),
  connectionTimeoutMillis: 10000,
});
async function verifyLogin(connectionString) {
  if (
    !connectionString ||
    new URL(connectionString).username !== "bottom_shelf_app_runtime"
  )
    throw new Error(
      "Existing runtime credential is missing; inspect the pending file without resetting the password",
    );
  const runtime = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
  });
  try {
    await runtime.connect();
    await runtime.query("SELECT 1");
  } finally {
    await runtime.end();
  }
}
try {
  await client.connect();
  const { rows } = await client.query(
    "SELECT rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname='bottom_shelf_app_runtime'",
  );
  if (rows.length) {
    if (Object.values(rows[0]).some(Boolean))
      throw new Error("Existing role is privileged; do not reuse it");
    await verifyLogin((pending ?? env).DATABASE_URL);
    if (pending) {
      await rename(pendingFile, file);
      console.log(
        "Interrupted provisioning recovered from the private pending configuration.",
      );
    } else
      console.log(
        "Existing non-admin runtime login verified; credentials are unchanged.",
      );
  } else {
    const saved = pending ? new URL(pending.DATABASE_URL) : null;
    const password = saved?.password ?? randomBytes(32).toString("hex");
    if (
      saved &&
      (saved.username !== "bottom_shelf_app_runtime" ||
        !/^[a-f0-9]{64}$/.test(password))
    )
      throw new Error(
        "Invalid pending runtime credential; inspect before continuing",
      );
    await client.query("BEGIN");
    await client.query(
      `CREATE ROLE bottom_shelf_app_runtime LOGIN PASSWORD '${password}' NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
    );
    if (!pending) {
      const runtime = new URL(owner);
      runtime.username = "bottom_shelf_app_runtime";
      runtime.password = password;
      runtime.hostname = runtime.hostname.replace(".c-", "-pooler.c-");
      env.DATABASE_URL = runtime.toString();
      env.DATABASE_MIGRATION_URL = owner.toString();
      await writeFile(
        pendingFile,
        Object.entries(env)
          .map(([name, value]) => name + "=" + JSON.stringify(value))
          .join("\n") + "\n",
        { flag: "wx", mode: 0o600 },
      );
    }
    await client.query("COMMIT");
    await rename(pendingFile, file);
    console.log(
      "Non-admin runtime login saved locally; run db:migrate then db:check.",
    );
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  // Keep durable credentials even when COMMIT's outcome is unknown. A retry
  // verifies a committed role or recreates a rolled-back role with the same key.
  console.error(
    "Provisioning failed; preserve any private pending file:",
    error.code ?? error.message,
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
