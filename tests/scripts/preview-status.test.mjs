import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportPreview,
  previewContext,
} from "../../scripts/preview-status.mjs";
import { approvePreview } from "../../scripts/preview-policy.mjs";

const sha = "a".repeat(40);
const env = {
  GITHUB_RUN_ID: "123",
  GH_TOKEN: "host-only-token",
  PREVIEW_RESULT: "success",
  PREVIEW_JOB_STATUS: "success",
  PREVIEW_URL: "https://bottom-shelf-pr-36.visegue.vercel.app",
};

test("preview status binds evidence to the approved PR head and trusted GitHub run", async () => {
  const reports = [];
  const options = {
    env,
    approve: async () => ({ pr: 36, sha }),
    fetchApi: async (url, init) => {
      assert.equal(
        url,
        `https://api.github.com/repos/Visegue/Bottom-Shelf/statuses/${sha}`,
      );
      assert.equal(init.headers.Authorization, "Bearer host-only-token");
      reports.push(JSON.parse(init.body));
      return Response.json({});
    },
  };
  assert.equal(await reportPreview("pending", options), "pending");
  assert.equal(await reportPreview("complete", options), "success");
  assert.equal(reports[1].context, previewContext);
  assert.equal(
    reports[1].target_url,
    "https://github.com/Visegue/Bottom-Shelf/actions/runs/123",
  );
  for (const changed of [
    { PREVIEW_RESULT: "skipped" },
    { PREVIEW_RESULT: "failure" },
    { PREVIEW_JOB_STATUS: "cancelled" },
    { PREVIEW_URL: "https://bottom-shelf-pr-37.visegue.vercel.app" },
    { PREVIEW_URL: "" },
  ])
    assert.equal(
      await reportPreview("complete", {
        ...options,
        env: { ...env, ...changed },
      }),
      "failure",
    );
  const count = reports.length;
  await assert.rejects(
    reportPreview("complete", {
      ...options,
      approve: async () => {
        throw new Error("stale head");
      },
    }),
    /stale head/,
  );
  assert.equal(
    reports.length,
    count,
    "stale revisions must never acquire success",
  );
  await assert.rejects(
    reportPreview("complete", {
      ...options,
      fetchApi: async () => new Response("denied", { status: 403 }),
    }),
    /publish/,
  );
});

test("a writer can explicitly verify a bot PR; automatic bots, readers and forks stay denied", () => {
  const request = {
    pr: 36,
    sha,
    ref: "refs/heads/main",
    actorPermission: "write",
    event: "workflow_dispatch",
  };
  const pr = {
    number: 36,
    state: "open",
    draft: false,
    user: { login: "dependabot[bot]", type: "Bot" },
    head: { sha, repo: { full_name: "Visegue/Bottom-Shelf" } },
    base: { ref: "main", repo: { full_name: "Visegue/Bottom-Shelf" } },
  };
  assert.equal(approvePreview(request, pr).sha, sha);
  assert.throws(() =>
    approvePreview({ ...request, event: "pull_request_target" }, pr),
  );
  assert.throws(() =>
    approvePreview({ ...request, actorPermission: "read" }, pr),
  );
  assert.throws(() =>
    approvePreview(request, {
      ...pr,
      head: { ...pr.head, repo: { full_name: "outside/fork" } },
    }),
  );
});
