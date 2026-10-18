import { test } from "node:test";
import assert from "node:assert/strict";
import {
  previewProvider,
  previewRuntime,
} from "../../scripts/preview-provider.mjs";

test("durable registry encrypts credentials and binds recovery to its PR", async () => {
  const previous = globalThis.fetch;
  let stored;
  globalThis.fetch = async (_url, options) => {
    if (options.method === "POST" || options.method === "PATCH") {
      stored = JSON.parse(options.body);
      return Response.json({});
    }
    return stored ? Response.json(stored) : new Response(null, { status: 404 });
  };
  try {
    const env = {
      PREVIEW_PR: "17",
      PREVIEW_STATE_KEY: "12".repeat(32),
      GH_TOKEN: "operator-fixture",
    };
    const api = previewProvider(env);
    const record = {
      pr: 17,
      storageSecret: "private-fixture-secret",
      passwords: { runtime: "private-password" },
    };
    await api.save(record);
    assert.doesNotMatch(
      stored.value,
      /private-fixture-secret|private-password/,
    );
    assert.deepEqual(await api.load(), record);
    await assert.rejects(previewProvider({ ...env, PREVIEW_PR: "18" }).load());
  } finally {
    globalThis.fetch = previous;
  }
});

test("execution configuration carries scoped credentials while management keys stay out", () => {
  const result = previewRuntime(
    {
      branchId: "br-fixture",
      sqlHost: "ep-fixture.eu-central-1.aws.neon.tech",
      storageKeyId: "nak_live_fixture",
      storageSecret: "scoped-storage",
      passwords: {
        bs_preview_runtime: "runtime-secret",
        bs_preview_migrator: "migrator-secret",
      },
    },
    {
      NEON_API_KEY: "project-management-secret",
      VERCEL_TOKEN: "vercel-management-secret",
      PREVIEW_STATE_KEY: "registry-secret",
      OWNER_USER_ID: "fixture-owner",
      OWNER_EMAIL: "owner@example.test",
      NEON_AUTH_BASE_URL: "https://stable-auth.example.test",
      NEON_AUTH_COOKIE_SECRET: "test-cookie-secret",
    },
  );
  assert.match(
    result.runtime.DATABASE_URL,
    /bs_preview_runtime:runtime-secret@/,
  );
  assert.match(
    result.migration.DATABASE_MIGRATION_URL,
    /bs_preview_migrator:migrator-secret@/,
  );
  assert.doesNotMatch(
    JSON.stringify(result.runtime),
    /migrator-secret|project-management-secret|vercel-management-secret|registry-secret/,
  );
  assert.deepEqual(Object.keys(result.migration).sort(), [
    "APP_ENV",
    "DATABASE_MIGRATION_URL",
    "PREVIEW_TARGET",
  ]);
});
