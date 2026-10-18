import { test } from "node:test";
import assert from "node:assert/strict";
import { approvePreview } from "../../scripts/preview-policy.mjs";
const sha = "a".repeat(40);
const request = {
  pr: 17,
  sha,
  actorPermission: "maintain",
  ref: "refs/heads/main",
};
const pr = {
  number: 17,
  state: "open",
  draft: false,
  user: { login: "alefr" },
  head: { sha, repo: { full_name: "Visegue/Bottom-Shelf" } },
  base: { ref: "main", repo: { full_name: "Visegue/Bottom-Shelf" } },
};
test("preview accepts only the exact approved same-repository PR revision from protected main", () => {
  assert.equal(approvePreview(request, pr).sha, sha);
  for (const changed of [
    { ...pr, head: { ...pr.head, sha: "b".repeat(40) } },
    { ...pr, head: { ...pr.head, repo: { full_name: "attacker/fork" } } },
    { ...pr, state: "closed" },
    { ...pr, user: { login: "dependabot[bot]" } },
  ])
    assert.throws(() => approvePreview(request, changed), /approved/);
  assert.throws(
    () => approvePreview({ ...request, ref: "refs/heads/untrusted" }, pr),
    /approved/,
  );
  assert.throws(
    () => approvePreview({ ...request, actorPermission: "read" }, pr),
    /approved/,
  );
});

test("free preview capacity refuses a full project and unknown or paid plans", async () => {
  const { requirePreviewCapacity } =
    await import("../../scripts/preview-policy.mjs");
  for (const capacity of [
    { neonPlan: "free_v3", branchLimit: 10, branches: 10, vercelPlan: "hobby" },
    { neonPlan: "launch", branchLimit: 10, branches: 2, vercelPlan: "hobby" },
    { neonPlan: "free_v3", branchLimit: 10, branches: 2, vercelPlan: "pro" },
  ])
    assert.throws(() => requirePreviewCapacity(capacity), /capacity|Free/);
});

test("registered preview identity permits its own branch and rejects stable or inherited resources", async () => {
  const { environmentTarget, assertDatabaseIdentity, verifyStorageTarget } =
    await import("../../scripts/environment-target.mjs");
  const target = {
    projectId: "blue-bar-96694914",
    branchId: "br-fixture-preview",
    database: "bs_preview",
    migrator: "bs_preview_migrator",
    runtime: "bs_preview_runtime",
    bucket: "preview-images",
    storageKeyId: "nak_live_fixture",
  };
  const env = {
    APP_ENV: "preview",
    PREVIEW_TARGET: JSON.stringify(target),
    AWS_REGION: "eu-central-1",
    STORAGE_BUCKET: "preview-images",
    AWS_ACCESS_KEY_ID: "nak_live_fixture",
    AWS_ENDPOINT_URL_S3:
      "https://br-fixture-preview.storage.c-8.eu-central-1.aws.neon.tech",
  };
  let actual;
  try {
    actual = environmentTarget(env).branchId;
  } catch {
    actual = "unprovisioned";
  }
  assert.equal(actual, "br-fixture-preview");
  assert.equal(verifyStorageTarget(env).bucket, "preview-images");
  assert.throws(
    () =>
      verifyStorageTarget({ ...env, AWS_ACCESS_KEY_ID: "copied-parent-key" }),
    /verification/,
  );
  assert.throws(
    () =>
      environmentTarget({
        ...env,
        PREVIEW_TARGET: JSON.stringify({
          ...target,
          branchId: "br-mute-art-baqyyyu3",
        }),
      }),
    /preview/i,
  );
  assert.throws(
    () =>
      assertDatabaseIdentity(
        {
          project_id: target.projectId,
          branch_id: "br-wrong",
          database: target.database,
          role: target.migrator,
        },
        "migrator",
        env,
      ),
    /verification/,
  );
});

test("a full Vercel day or occupied free build slot stops resource creation", async () => {
  const { requirePreviewCapacity } =
    await import("../../scripts/preview-policy.mjs");
  const capacity = {
    neonPlan: "free_v3",
    branchLimit: 10,
    branches: 2,
    vercelPlan: "hobby",
    vercelDaily: 0,
    vercelActive: 0,
  };
  assert.throws(
    () => requirePreviewCapacity({ ...capacity, vercelDaily: 100 }),
    /capacity/,
  );
  assert.throws(
    () => requirePreviewCapacity({ ...capacity, vercelActive: 1 }),
    /capacity/,
  );
});
