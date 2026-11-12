import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateHistory } from "./migration-history.mjs";

export async function migrationFiles(directory) {
  return Promise.all(
    (await readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map(async (name) => {
        const source = await readFile(new URL(name, directory), "utf8");
        return {
          name,
          source,
          checksum: createHash("sha256").update(source).digest("hex"),
        };
      }),
  );
}

// The CLI verifies the real target before calling this transaction runner.
// The same runner is exercised against disposable local Postgres in CI.
export async function runMigrations(client, files, runtime) {
  if (runtime && !/^[a-z_][a-z0-9_]*$/.test(runtime))
    throw new Error("Invalid runtime role");
  try {
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
    if (runtime) {
      await client.query(`GRANT USAGE ON SCHEMA public TO "${runtime}"`);
      await client.query(`GRANT SELECT ON schema_migrations TO "${runtime}"`);
      await client.query(
        `GRANT SELECT, INSERT, DELETE ON foundation_checks TO "${runtime}"`,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
