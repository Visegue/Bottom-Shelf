import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanupPreview,
  preparePreview,
} from "../../scripts/preview-lifecycle.mjs";
const record = () => ({
  pr: 17,
  token: "0123456789abcdef",
  branchId: "br-fixture-preview",
  name: "preview-17-0123456789abcdef",
  deployments: [],
});
function provider(blocked = false) {
  let exists = true,
    live = true;
  return {
    get exists() {
      return exists;
    },
    get live() {
      return live;
    },
    async branch() {
      return exists
        ? {
            id: "br-fixture-preview",
            project_id: "blue-bar-96694914",
            parent_id: "br-mute-art-baqyyyu3",
            name: "preview-17-0123456789abcdef",
          }
        : null;
    },
    async children() {
      return [];
    },
    async deployments() {
      return live
        ? [
            {
              id: "dpl_fixture",
              url: "preview-fixture.vercel.app",
              projectId: "prj_9mmJV4XIqdZyvhtpwh2amkiQS2k6",
              target: null,
              meta: { bottomShelfPreview: "0123456789abcdef" },
            },
          ]
        : [];
    },
    async removeDeployment() {
      if (!blocked) live = false;
    },
    async deployment() {
      return live
        ? {
            id: "dpl_fixture",
            url: "preview-fixture.vercel.app",
            projectId: "prj_9mmJV4XIqdZyvhtpwh2amkiQS2k6",
            target: null,
            meta: { bottomShelfPreview: "0123456789abcdef" },
          }
        : null;
    },
    async retiredUrl() {
      return !live;
    },
    async removeOrigin() {},
    async revokeStorage() {},
    async removeBranch() {
      exists = false;
    },
    async save() {},
  };
}
test("explicit cleanup blocks old URLs before deleting only its registered branch and is repeatable", async () => {
  const api = provider();
  const state = record();
  await cleanupPreview(state, api);
  assert.equal(
    api.live,
    false,
    "old direct deployment URL must be inaccessible",
  );
  assert.equal(api.exists, false);
  await cleanupPreview(state, api);
});
test("failed URL retirement preserves data for recovery", async () => {
  const api = provider(true);
  await assert.rejects(cleanupPreview(record(), api), /retir/i);
  assert.equal(api.exists, true);
});
test("cleanup cannot target stable Auth even with a corrupted resource registry", async () => {
  const api = provider();
  await assert.rejects(
    cleanupPreview({ ...record(), branchId: "br-mute-art-baqyyyu3" }, api),
    /identity|protected/i,
  );
  assert.equal(api.exists, true);
});

test("provisioning records a fresh isolated branch and preserves it on repeat deployment", async () => {
  const { preparePreview } =
    await import("../../scripts/preview-lifecycle.mjs");
  const state = {
    pr: 17,
    token: "0123456789abcdef",
    name: "preview-17-0123456789abcdef",
    deployments: [],
  };
  let branches = [],
    provisioned;
  const api = {
    async capacity() {
      return {
        neonPlan: "free_v3",
        branchLimit: 10,
        branches: branches.length + 2,
        vercelPlan: "hobby",
        vercelDaily: 0,
        vercelActive: 0,
      };
    },
    async children() {
      return [];
    },
    async findBranch(name) {
      return branches.find((branch) => branch.name === name);
    },
    async createBranch(name) {
      const branch = {
        id: "br-new-preview",
        project_id: "blue-bar-96694914",
        parent_id: "br-mute-art-baqyyyu3",
        name,
      };
      branches.push(branch);
      return branch;
    },
    async branch() {
      return branches[0];
    },
    async save() {},
    async deployments() {
      return [];
    },
    async bootstrap(record) {
      provisioned = record.branchId;
    },
    async storage() {
      return {
        token_id: "nak_live_preview",
        s3_secret_access_key: "new-scoped-secret",
      };
    },
  };
  await preparePreview(state, api);
  assert.equal(
    state.branchId,
    "br-new-preview",
    "new preview must use its registered branch",
  );
  assert.equal(provisioned, "br-new-preview");
  assert.equal(state.storageKeyId, "nak_live_preview");
  await preparePreview(state, api);
  assert.equal(
    branches.length,
    1,
    "ordinary deployment reuses persistent preview data",
  );
});

test("cleanup verifies a saved deployment's actual identity before deleting it", async () => {
  const api = provider();
  let deleted = false;
  api.deployments = async () => [];
  api.deployment = async () => ({
    projectId: "prj_foreign",
    meta: { bottomShelfPreview: "other" },
  });
  api.removeDeployment = async () => {
    deleted = true;
  };
  const state = {
    ...record(),
    deployments: [{ id: "dpl_foreign", url: "foreign.vercel.app" }],
  };
  await assert.rejects(cleanupPreview(state, api), /identity/i);
  assert.equal(deleted, false);
});

test("cleanup recovers a branch created before its response was saved", async () => {
  const api = provider();
  api.findBranch = async () => api.branch();
  const state = { ...record(), branchId: undefined };
  await cleanupPreview(state, api);
  assert.equal(
    api.exists,
    false,
    "registered creation intent must permit orphan recovery",
  );
});

test("preview reuse refuses descendants before retiring addresses or changing data", async () => {
  const api = provider();
  let changed = false;
  api.children = async () => [{ id: "br-descendant" }];
  api.bootstrap = async () => {
    changed = true;
  };
  const state = {
    ...record(),
    storageKeyId: "nak_live_fixture",
    storageSecret: "scoped-secret",
  };
  await assert.rejects(preparePreview(state, api), /descendants/);
  assert.equal(changed, false);
  assert.equal(
    api.live,
    true,
    "blocked reuse must preserve the current preview",
  );
});
