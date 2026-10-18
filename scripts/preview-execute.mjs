// Runs in a disposable execution job with ONLY this preview's scoped credentials.
import { spawnSync } from "node:child_process";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { verifyDatabaseTarget } from "./environment-target.mjs";
const input = JSON.parse(process.env.PREVIEW_INPUT);
function run(cwd, command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  // PR code can print scoped secrets or reference data. Its stdout/stderr is never published.
  if (result.error || result.status !== 0)
    throw new Error(`Isolated command failed: ${command}; output withheld`);
}
async function seed(cwd, runtime, checkOnly = false) {
  const directory = resolve(
    process.env.RUNNER_TEMP ?? ".",
    "preview-reference",
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = resolve(directory, "reference.json");
  await writeFile(file, JSON.stringify(input.reference), { mode: 0o600 });
  run(
    cwd,
    process.execPath,
    ["scripts/seed-development.mjs", ...(checkOnly ? ["--check"] : [])],
    { ...runtime, REFERENCE_DATA_FILE: file },
  );
}
async function services(cwd, runtime, previous = false) {
  // The prior release runs unchanged application code under its established
  // development entry point, with only its non-secret target registry adapted.
  if (previous) {
    const targetsFile = resolve(cwd, "config/environments.json");
    const targets = JSON.parse(await readFile(targetsFile, "utf8"));
    targets.development = JSON.parse(runtime.PREVIEW_TARGET);
    await writeFile(targetsFile, JSON.stringify(targets));
  }
  run(cwd, "npm", ["run", "test:services"], {
    ...runtime,
    APP_ENV: previous ? "development" : "preview",
  });
}
async function migrate(cwd, target) {
  run(cwd, process.execPath, ["scripts/migrate.mjs"], target.migration);
}
try {
  const candidate = resolve("candidate"),
    baseline = resolve("baseline");
  for (const [cwd, sha] of [
    [candidate, input.sha],
    [baseline, input.previousSha],
  ]) {
    const actual = spawnSync(
      "git",
      ["-c", `safe.directory=${cwd}`, "rev-parse", "HEAD"],
      {
        cwd,
        encoding: "utf8",
      },
    );
    if (actual.status !== 0 || actual.stdout.trim() !== sha)
      throw new Error("Execution revision differs");
    run(cwd, "npm", ["ci"]);
  }
  const client = new Client({
    connectionString: input.preview.migration.DATABASE_MIGRATION_URL,
    connectionTimeoutMillis: 10000,
  });
  let initialized;
  try {
    await client.connect();
    await verifyDatabaseTarget(client, "migrator", input.preview.migration);
    const {
      rows: [row],
    } = await client.query(
      "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS initialized",
    );
    initialized = row.initialized;
  } finally {
    await client.end();
  }
  if (!initialized) {
    // Bootstrap previous schema and representative saved nonproduction data.
    const targetsFile = resolve(baseline, "config/environments.json");
    const targets = JSON.parse(await readFile(targetsFile, "utf8"));
    targets.development = JSON.parse(input.preview.runtime.PREVIEW_TARGET);
    await writeFile(targetsFile, JSON.stringify(targets));
    run(baseline, process.execPath, ["scripts/migrate.mjs"], {
      ...input.preview.migration,
      APP_ENV: "development",
    });
    await seed(baseline, { ...input.preview.runtime, APP_ENV: "development" });
  }
  await services(baseline, input.preview.runtime, true);
  // Independent bootstrap of the candidate into the empty disposable probe DB.
  await migrate(candidate, input.probe);
  await seed(candidate, input.probe.runtime);
  run(
    candidate,
    process.execPath,
    ["scripts/check-database.mjs"],
    input.probe.runtime,
  );
  await services(candidate, input.probe.runtime);
  // Upgrade persistent preview data without resetting migration history or rows.
  await migrate(candidate, input.preview);
  await seed(candidate, input.preview.runtime);
  run(
    candidate,
    process.execPath,
    ["scripts/check-database.mjs"],
    input.preview.runtime,
  );
  await services(candidate, input.preview.runtime);
  // Previous app reads/writes after candidate migrations and candidate writes.
  await services(baseline, input.preview.runtime, true);
  await seed(candidate, input.preview.runtime, true);
  console.log(
    "Isolated bootstrap, upgrade, saved-reference persistence and previous-app service checks passed. Auth here is a fixture; real Google login remains separate.",
  );
} catch {
  console.error(
    "Isolated migration/compatibility verification failed; scoped output withheld. Preview must not deploy.",
  );
  process.exitCode = 1;
}
