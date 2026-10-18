import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { verifyDatabaseTarget } from "./environment-target.mjs";
import { validateHistory } from "./migration-history.mjs";

let client;
try {
  const rawConnection = process.env.DATABASE_MIGRATION_URL;
  if (!rawConnection)
    throw new Error("Migration target configuration required");
  const connection = new URL(rawConnection);
  connection.searchParams.set("sslmode", "verify-full");
  const connectionString = connection.toString();
  if (!connectionString) throw new Error("DATABASE_MIGRATION_URL is required");
  if (new URL(connectionString).hostname.includes("-pooler"))
    throw new Error("Migrations require a direct connection");
  const files = [];
  for (const name of (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const source = await readFile(
      new URL(`../migrations/${name}`, import.meta.url),
      "utf8",
    );
    files.push({
      name,
      source,
      checksum: createHash("sha256").update(source).digest("hex"),
    });
  }
  client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  const target = await verifyDatabaseTarget(client);
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '10s'");
  await client.query("SELECT pg_advisory_xact_lock(784521904)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const { rows: applied } = await client.query(
    "SELECT name, checksum FROM schema_migrations ORDER BY name",
  );
  validateHistory(files, applied);
  for (const file of files.slice(applied.length)) {
    await client.query(file.source);
    await client.query(
      "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
      [file.name, file.checksum],
    );
  }
  if (process.env.APP_ENV === "development") {
    await client.query(`GRANT USAGE ON SCHEMA public TO "${target.runtime}"`);
    await client.query(
      `GRANT SELECT, INSERT, DELETE ON foundation_checks TO "${target.runtime}"`,
    );
  }
  await client.query("COMMIT");
  console.log("Migration history verified; migrations are up to date.");
} catch (error) {
  await client?.query("ROLLBACK").catch(() => {});
  console.error(
    "Migration failed:",
    error.message?.startsWith("Migration history") ||
      error.message?.includes("target")
      ? error.message
      : (error.code ?? error.name),
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
