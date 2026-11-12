import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { migrationFiles, runMigrations } from "./migration-runner.mjs";
import { validateHistory } from "./migration-history.mjs";
import compatibility from "../config/compatibility.json" with { type: "json" };

// This test never reads application/admin credentials or targets a Neon endpoint.
const url = new URL(process.env.TEST_DATABASE_URL ?? "http://invalid");
assert.equal(url.protocol, "postgresql:");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
assert.equal(url.pathname, "/postgres");
assert.equal(url.username, "postgres");
assert.match(compatibility.foundationBaseline, /^[a-f0-9]{40}$/);
const admin = new Client({
  connectionString: url.href,
  connectionTimeoutMillis: 5000,
});
const databases = [];
const roles = [];
const root = await mkdtemp(join(tmpdir(), "bs-compatibility-"));
const git = (...args) =>
  execFileSync("git", ["--no-replace-objects", ...args], { encoding: "utf8" });
async function connect(database, role = "postgres") {
  const target = new URL(url);
  target.pathname = `/${database}`;
  if (role !== "postgres") {
    target.username = role;
    target.password = "synthetic-runtime-only";
  }
  const client = new Client({
    connectionString: target.href,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  return client;
}
function probe(source) {
  const target = new URL(url);
  target.pathname = "/bs_preview";
  target.username = "bs_preview_runtime";
  target.password = "synthetic-runtime-only";
  execFileSync(
    process.execPath,
    [resolve("tests/fixtures/compatibility-probe.mjs"), source],
    {
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: target.href,
        APP_ENV: "preview",
        FOUNDATION_CHECK_ENABLED: "true",
        AWS_ENDPOINT_URL_S3:
          "https://br-holy-bird-barhw055.storage.c-8.eu-central-1.aws.neon.tech",
        AWS_REGION: "eu-central-1",
        STORAGE_BUCKET: "preview-images",
        AWS_ACCESS_KEY_ID: "synthetic",
        AWS_SECRET_ACCESS_KEY: "synthetic",
      },
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

try {
  await admin.connect();
  const {
    rows: [identity],
  } = await admin.query(
    "SELECT current_setting('neon.project_id', true) AS neon, current_user AS role",
  );
  assert.ok(
    !identity.neon,
    "Neon targets are forbidden for this disposable test",
  );
  assert.equal(identity.role, "postgres");
  for (const role of ["bottom_shelf_app_runtime", "bs_preview_runtime"]) {
    await admin.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD 'synthetic-runtime-only' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    roles.push(role);
  }
  for (const database of ["bs_bootstrap_fixture", "bs_preview"]) {
    // Existing databases are never reused, reset or dropped by this harness.
    await admin.query(`CREATE DATABASE "${database}"`);
    databases.push(database);
  }
  await admin.query(
    "ALTER DATABASE bs_preview SET neon.project_id = 'blue-bar-96694914'",
  );
  await admin.query(
    "ALTER DATABASE bs_preview SET neon.branch_id = 'br-holy-bird-barhw055'",
  );
  const baseline = compatibility.foundationBaseline;
  for (const file of [
    "src/lib/foundation.ts",
    "src/lib/config.ts",
    "scripts/environment-target.mjs",
    "config/environments.json",
  ]) {
    const path = join(root, file);
    await mkdir(resolve(path, ".."), { recursive: true });
    let source = git("show", `${baseline}:${file}`);
    if (file === "config/environments.json") {
      const config = JSON.parse(source);
      // Only the copied test module is altered; real target verification is unchanged.
      delete config.preview.storageKeyHash;
      config.preview.storageKeyId = "synthetic";
      source = JSON.stringify(config);
    }
    await writeFile(path, source);
  }
  const baselineFiles = git("ls-tree", "--name-only", baseline, "migrations/")
    .trim()
    .split("\n")
    .filter((x) => x.endsWith(".sql"));
  const baselineDirectory = new URL("migrations/", pathToFileURL(root + "/"));
  await mkdir(baselineDirectory);
  for (const file of baselineFiles)
    await writeFile(
      new URL(file.slice("migrations/".length), baselineDirectory),
      git("show", `${baseline}:${file}`),
    );
  const previous = await migrationFiles(baselineDirectory);
  const candidate = await migrationFiles(
    new URL("../migrations/", import.meta.url),
  );
  validateHistory(candidate, previous);
  const bootstrap = await connect("bs_bootstrap_fixture");
  try {
    await runMigrations(bootstrap, candidate, "bs_preview_runtime");
    await runMigrations(bootstrap, candidate, "bs_preview_runtime");
    assert.equal(
      Number(
        (await bootstrap.query("SELECT count(*) FROM schema_migrations"))
          .rows[0].count,
      ),
      candidate.length,
    );
  } finally {
    await bootstrap.end();
  }
  console.log("Empty-database bootstrap and repeat migration passed.");

  const upgrade = await connect("bs_preview");
  try {
    await runMigrations(upgrade, previous, "bs_preview_runtime");
    await upgrade.query(
      "INSERT INTO foundation_checks (id,owner_id,nonce,image_key) VALUES ('00000000-0000-4000-8000-000000000001','saved-owner','00000000-0000-4000-8000-000000000002','saved/private.png')",
    );
    const saved = (
      await upgrade.query("SELECT * FROM foundation_checks ORDER BY id")
    ).rows;
    probe(join(root, "src/lib/foundation.ts"));
    await runMigrations(upgrade, candidate, "bs_preview_runtime");
    assert.deepEqual(
      (await upgrade.query("SELECT * FROM foundation_checks ORDER BY id")).rows,
      saved,
    );
    // Candidate's real module needs the same synthetic target-key adaptation.
    const currentRoot = join(root, "current");
    for (const file of [
      "src/lib/foundation.ts",
      "src/lib/config.ts",
      "scripts/environment-target.mjs",
      "config/environments.json",
    ]) {
      const { readFile } = await import("node:fs/promises");
      const path = join(currentRoot, file);
      await mkdir(resolve(path, ".."), { recursive: true });
      await writeFile(
        path,
        file === "config/environments.json"
          ? await readFile(join(root, file))
          : await readFile(resolve(file)),
      );
    }
    probe(join(currentRoot, "src/lib/foundation.ts"));
    // Representative data written after upgrade must remain readable by the old app.
    await upgrade.query(
      "INSERT INTO foundation_checks (id,owner_id,nonce,image_key) VALUES ('00000000-0000-4000-8000-000000000003','new-owner','00000000-0000-4000-8000-000000000004','new/private.png')",
    );
    probe(join(root, "src/lib/foundation.ts"));
    assert.equal(
      Number(
        (await upgrade.query("SELECT count(*) FROM foundation_checks")).rows[0]
          .count,
      ),
      2,
    );
    const runtime = await connect("bs_preview", "bs_preview_runtime");
    try {
      assert.equal(
        (
          await runtime.query(
            "SELECT owner_id FROM foundation_checks WHERE id='00000000-0000-4000-8000-000000000003'",
          )
        ).rows[0].owner_id,
        "new-owner",
      );
      await assert.rejects(
        runtime.query("CREATE TABLE forbidden (id int)"),
        /permission denied/,
      );
      await assert.rejects(
        runtime.query("DELETE FROM schema_migrations"),
        /permission denied/,
      );
    } finally {
      await runtime.end();
    }
    const failing = [
      ...candidate,
      {
        name: "999_failure.sql",
        checksum: "fixture",
        source: "CREATE TABLE must_rollback(id int); SELECT 1/0;",
      },
    ];
    await assert.rejects(
      runMigrations(upgrade, failing, "bs_preview_runtime"),
      /division by zero/,
    );
    assert.equal(
      (await upgrade.query("SELECT to_regclass('must_rollback') AS table_name"))
        .rows[0].table_name,
      null,
    );
    assert.equal(
      Number(
        (await upgrade.query("SELECT count(*) FROM schema_migrations")).rows[0]
          .count,
      ),
      candidate.length,
    );
    probe(join(root, "src/lib/foundation.ts"));
    console.log(
      `Upgrade from ${baseline}, actual old/new application probes, retained data, runtime permissions and transactional failure recovery passed.`,
    );
  } finally {
    await upgrade.end();
  }
} finally {
  for (const database of databases.reverse())
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  for (const role of roles.reverse()) await admin.query(`DROP ROLE "${role}"`);
  await admin.end();
  await rm(root, { recursive: true, force: true });
}
