import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function runFailedDeploy(providerScript, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "bottom-shelf-deploy-"));
  try {
    writeFileSync(
      join(directory, "npx"),
      `#!${process.execPath}\n${providerScript}\nprocess.exit(17);\n`,
      { mode: 0o700 },
    );
    return spawnSync(process.execPath, ["scripts/deploy-test.mjs"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: directory,
        APP_ENV: "test",
        CI: "true",
        GITHUB_REF: "refs/heads/main",
        VERCEL_TOKEN: "project-scoped-fixture",
        VERCEL_ORG_ID: "team_J9VXW7YbzLRuOTDPUyQTpEUP",
        VERCEL_PROJECT_ID: "prj_9mmJV4XIqdZyvhtpwh2amkiQS2k6",
        ...environment,
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("deployment failures retain the provider error without exposing credentials", () => {
  const credentials = {
    VERCEL_TOKEN: "private-ci-token-fixture",
    DATABASE_URL: "postgresql://runtime:private-runtime-password@db.test/app",
    DATABASE_MIGRATION_URL:
      "postgresql://owner:private-migration-password@db.test/app",
  };
  const result = runFailedDeploy(
    `console.error("Provider rejected the deployment");
console.log(process.env.VERCEL_TOKEN);
console.error(process.env.DATABASE_URL, process.env.DATABASE_MIGRATION_URL);`,
    credentials,
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Provider rejected the deployment/);
  assert.match(result.stderr, /17/);
  for (const value of Object.values(credentials)) {
    assert.ok(!result.stderr.includes(value));
    assert.ok(!result.stdout.includes(value));
  }
  assert.match(result.stderr, /<REDACTED>/);
});

test("CI deployment uses project context without requiring a user-profile lookup", () => {
  const result = runFailedDeploy(
    `console.error(process.argv.includes("--scope") ? "User not found (404)" : "Project context accepted; fixture stopped before upload");`,
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Project context accepted/);
  assert.doesNotMatch(result.stderr, /User not found/);
});
