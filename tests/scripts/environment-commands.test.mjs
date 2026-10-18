import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import targets from "../../config/environments.json" with { type: "json" };
import { spawnSync } from "node:child_process";

test("migration refuses the wrong actual branch before changing data even with copied credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bottom-shelf-target-"));
  const writes = join(directory, "writes");
  await writeFile(writes, "");
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "./tests/fixtures/postgres-loader.mjs",
        "scripts/migrate.mjs",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENV: "development",
          DATABASE_MIGRATION_URL:
            "postgresql://bottom_shelf_dev_migrator:copied-password@ep-fixture.eu-central-1.aws.neon.tech/bottom_shelf_development?sslmode=verify-full",
          TEST_DATABASE_WRITES: writes,
          TEST_DATABASE_IDENTITY: JSON.stringify({
            project_id: "blue-bar-96694914",
            branch_id: "br-wrong-branch",
            database: "bottom_shelf_development",
            role: "bottom_shelf_dev_migrator",
          }),
        },
      },
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /target/i);
    assert.equal(
      await readFile(writes, "utf8"),
      "",
      "rejected target must stay unchanged",
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("development bootstrap refuses the stable Auth branch before provisioning roles or databases", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bottom-shelf-bootstrap-"));
  const writes = join(directory, "writes");
  await writeFile(writes, "");
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "./tests/fixtures/postgres-loader.mjs",
        "scripts/bootstrap-development.mjs",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENV: "development",
          DATABASE_BOOTSTRAP_URL:
            "postgresql://neondb_owner:copied-password@ep-fixture.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full",
          TEST_DATABASE_WRITES: writes,
          TEST_DATABASE_IDENTITY: JSON.stringify({
            project_id: "blue-bar-96694914",
            branch_id: "br-mute-art-baqyyyu3",
            database: "neondb",
            role: "neondb_owner",
          }),
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /target verification failed/);
    assert.equal(await readFile(writes, "utf8"), "");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("bootstrap saves a runtime-only development configuration with restrictive file permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bottom-shelf-bootstrap-"));
  const writes = join(directory, "writes");
  await writeFile(writes, "");
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        new URL("../fixtures/postgres-loader.mjs", import.meta.url).pathname,
        new URL("../../scripts/bootstrap-development.mjs", import.meta.url)
          .pathname,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENV: "development",
          DATABASE_BOOTSTRAP_URL:
            "postgresql://neondb_owner:copied-password@ep-fixture.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full",
          TEST_DATABASE_WRITES: writes,
          TEST_DATABASE_IDENTITY: JSON.stringify({
            project_id: "blue-bar-96694914",
            branch_id: "br-lingering-water-bawa84pd",
            database: "neondb",
            role: "neondb_owner",
          }),
          NEON_AUTH_BASE_URL: "https://auth.example.test/auth",
          NEON_AUTH_COOKIE_SECRET: "synthetic-cookie-secret",
          OWNER_USER_ID: "verified-fixture-owner",
          OWNER_EMAIL: "owner@example.test",
          AWS_ENDPOINT_URL_S3:
            "https://br-lingering-water-bawa84pd.storage.c-8.eu-central-1.aws.neon.tech",
          AWS_REGION: "eu-central-1",
          STORAGE_BUCKET: "development-images",
          AWS_ACCESS_KEY_ID: targets.development.storageKeyId,
          AWS_SECRET_ACCESS_KEY: "fixture-secret",
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const config = await readFile(
      join(directory, ".env.development.local"),
      "utf8",
    );
    assert.match(config, /bottom_shelf_dev_runtime/);
    assert.doesNotMatch(
      config,
      /copied-password|DATABASE_MIGRATION_URL|DATABASE_BOOTSTRAP_URL/,
    );
    const { stat } = await import("node:fs/promises");
    assert.equal(
      (await stat(join(directory, ".env.development.local"))).mode & 0o777,
      0o600,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("legacy runtime provisioning also refuses a copied credential pointing at another branch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bottom-shelf-provision-"));
  const writes = join(directory, "writes");
  await writeFile(writes, "");
  await writeFile(join(directory, ".env.local"), 'APP_ENV="test"\n');
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        new URL("../fixtures/postgres-loader.mjs", import.meta.url).pathname,
        new URL("../../scripts/provision-runtime.mjs", import.meta.url)
          .pathname,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENV: "test",
          DATABASE_MIGRATION_URL:
            "postgresql://neondb_owner:copied-password@ep-fixture.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full",
          TEST_DATABASE_WRITES: writes,
          TEST_DATABASE_IDENTITY: JSON.stringify({
            project_id: "blue-bar-96694914",
            branch_id: "br-lingering-water-bawa84pd",
            database: "neondb",
            role: "neondb_owner",
          }),
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /target verification failed/);
    assert.equal(await readFile(writes, "utf8"), "");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("storage command refuses an ancestor credential even when its inherited access could work", () => {
  const result = spawnSync(process.execPath, ["scripts/check-storage.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      APP_ENV: "development",
      AWS_ENDPOINT_URL_S3:
        "https://br-lingering-water-bawa84pd.storage.c-8.eu-central-1.aws.neon.tech",
      AWS_REGION: "eu-central-1",
      STORAGE_BUCKET: "development-images",
      AWS_ACCESS_KEY_ID: "copied-ancestor-key",
      AWS_SECRET_ACCESS_KEY: "synthetic-secret",
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Storage target verification failed/);
  assert.doesNotMatch(result.stderr, /synthetic-secret/);
});

test("bootstrap rejects the inherited storage key before making database changes", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "bottom-shelf-bootstrap-key-"),
  );
  const writes = join(directory, "writes");
  await writeFile(writes, "");
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        new URL("../fixtures/postgres-loader.mjs", import.meta.url).pathname,
        new URL("../../scripts/bootstrap-development.mjs", import.meta.url)
          .pathname,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENV: "development",
          DATABASE_BOOTSTRAP_URL:
            "postgresql://neondb_owner:copied-password@ep-fixture.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full",
          TEST_DATABASE_WRITES: writes,
          TEST_DATABASE_IDENTITY: JSON.stringify({
            project_id: "blue-bar-96694914",
            branch_id: "br-lingering-water-bawa84pd",
            database: "neondb",
            role: "neondb_owner",
          }),
          AWS_ENDPOINT_URL_S3:
            "https://br-lingering-water-bawa84pd.storage.c-8.eu-central-1.aws.neon.tech",
          AWS_REGION: "eu-central-1",
          STORAGE_BUCKET: "development-images",
          AWS_ACCESS_KEY_ID: "copied-ancestor-key",
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Storage target verification failed/);
    assert.equal(await readFile(writes, "utf8"), "");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("reference bootstrap refuses a dataset belonging to another owner without changing the target", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bottom-shelf-reference-"));
  const writes = join(directory, "writes");
  await writeFile(writes, "");
  const reference = join(directory, "reference.json");
  await writeFile(
    reference,
    JSON.stringify({
      version: 1,
      ownerId: "another-owner",
      id: "683d8dcf-3a91-4b3e-95a8-fcfb8b894003",
      nonce: "ce4c55f7-d736-4cb6-b7fa-c504c82ed46c",
      image: "synthetic",
    }),
    { mode: 0o600 },
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        new URL("../fixtures/postgres-loader.mjs", import.meta.url).pathname,
        "scripts/seed-development.mjs",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENV: "development",
          OWNER_USER_ID: "verified-fixture-owner",
          REFERENCE_DATA_FILE: reference,
          TEST_DATABASE_WRITES: writes,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Reference owner verification failed/);
    assert.equal(await readFile(writes, "utf8"), "");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("reference verification reports missing saved data instead of silently reseeding it", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "bottom-shelf-reference-check-"),
  );
  const writes = join(directory, "writes");
  await writeFile(writes, "");
  const reference = join(directory, "reference.json");
  await writeFile(
    reference,
    JSON.stringify({
      version: 1,
      ownerId: "verified-fixture-owner",
      sourceAuthUrl: "https://fixture.example/auth",
      id: "683d8dcf-3a91-4b3e-95a8-fcfb8b894003",
      nonce: "ce4c55f7-d736-4cb6-b7fa-c504c82ed46c",
      image:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
    }),
    { mode: 0o600 },
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        new URL("../fixtures/postgres-loader.mjs", import.meta.url).pathname,
        "scripts/seed-development.mjs",
        "--check",
      ],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          APP_ENV: "development",
          OWNER_USER_ID: "verified-fixture-owner",
          NEON_AUTH_BASE_URL: "https://fixture.example/auth",
          REFERENCE_DATA_FILE: reference,
          TEST_DATABASE_WRITES: writes,
          DATABASE_URL:
            "postgresql://bottom_shelf_dev_runtime:synthetic@ep-fixture.eu-central-1.aws.neon.tech/bottom_shelf_development?sslmode=verify-full",
          TEST_DATABASE_IDENTITY: JSON.stringify({
            project_id: "blue-bar-96694914",
            branch_id: "br-lingering-water-bawa84pd",
            database: "bottom_shelf_development",
            role: "bottom_shelf_dev_runtime",
          }),
          AWS_ENDPOINT_URL_S3:
            "https://br-lingering-water-bawa84pd.storage.c-8.eu-central-1.aws.neon.tech",
          AWS_REGION: "eu-central-1",
          STORAGE_BUCKET: "development-images",
          AWS_ACCESS_KEY_ID: targets.development.storageKeyId,
          AWS_SECRET_ACCESS_KEY: "synthetic",
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Reference data is missing/);
    assert.equal(await readFile(writes, "utf8"), "");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("migration reports malformed connection configuration without exposing its value", () => {
  const result = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      APP_ENV: "development",
      DATABASE_MIGRATION_URL: "not-a-url-private-credential-12345",
    },
  });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /private-credential-12345/);
});

test("bootstrap refuses an existing database owned by another principal before changing it", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "bottom-shelf-existing-database-"),
  );
  const writes = join(directory, "writes");
  await writeFile(writes, "");
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        new URL("../fixtures/postgres-loader.mjs", import.meta.url).pathname,
        new URL("../../scripts/bootstrap-development.mjs", import.meta.url)
          .pathname,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENV: "development",
          DATABASE_BOOTSTRAP_URL:
            "postgresql://neondb_owner:synthetic@ep-fixture.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full",
          TEST_DATABASE_WRITES: writes,
          TEST_DATABASE_IDENTITY: JSON.stringify({
            project_id: "blue-bar-96694914",
            branch_id: "br-lingering-water-bawa84pd",
            database: "neondb",
            role: "neondb_owner",
          }),
          TEST_DATABASE_OWNER: "some_other_owner",
          AWS_ENDPOINT_URL_S3:
            "https://br-lingering-water-bawa84pd.storage.c-8.eu-central-1.aws.neon.tech",
          AWS_REGION: "eu-central-1",
          STORAGE_BUCKET: "development-images",
          AWS_ACCESS_KEY_ID: targets.development.storageKeyId,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Existing database owner/);
    assert.equal(await readFile(writes, "utf8"), "");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("bootstrap refuses to invent replacement passwords when saved credentials for existing roles are lost", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "bottom-shelf-lost-credentials-"),
  );
  const writes = join(directory, "writes");
  await writeFile(writes, "");
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        new URL("../fixtures/postgres-loader.mjs", import.meta.url).pathname,
        new URL("../../scripts/bootstrap-development.mjs", import.meta.url)
          .pathname,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENV: "development",
          DATABASE_BOOTSTRAP_URL:
            "postgresql://neondb_owner:synthetic@ep-fixture.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full",
          TEST_DATABASE_WRITES: writes,
          TEST_DATABASE_IDENTITY: JSON.stringify({
            project_id: "blue-bar-96694914",
            branch_id: "br-lingering-water-bawa84pd",
            database: "neondb",
            role: "neondb_owner",
          }),
          TEST_EXISTING_ROLES: "true",
          AWS_ENDPOINT_URL_S3:
            "https://br-lingering-water-bawa84pd.storage.c-8.eu-central-1.aws.neon.tech",
          AWS_REGION: "eu-central-1",
          STORAGE_BUCKET: "development-images",
          AWS_ACCESS_KEY_ID: targets.development.storageKeyId,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Existing development roles require their saved credentials/,
    );
    assert.equal(await readFile(writes, "utf8"), "");
    await assert.rejects(
      readFile(join(directory, ".env.development.credentials.local")),
      { code: "ENOENT" },
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});
