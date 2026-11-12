import { Client } from "pg";
import { verifyDatabaseTarget } from "./environment-target.mjs";
import { migrationFiles, runMigrations } from "./migration-runner.mjs";

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
  const files = await migrationFiles(
    new URL("../migrations/", import.meta.url),
  );
  client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  const target = await verifyDatabaseTarget(client);
  await runMigrations(
    client,
    files,
    ["development", "preview"].includes(process.env.APP_ENV)
      ? target.runtime
      : undefined,
  );
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
