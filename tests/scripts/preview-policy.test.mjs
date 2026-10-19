import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approvePreview,
  previewRequest,
  previewAlias,
} from "../../scripts/preview-policy.mjs";
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

test("automatic previews bind the protected main event to the exact PR revision", () => {
  const env = {
    GITHUB_REPOSITORY: "Visegue/Bottom-Shelf",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "pull_request_target",
    PREVIEW_PR: "17",
    PREVIEW_SHA: sha,
  };
  const event = {
    action: "synchronize",
    pull_request: { number: 17, head: { sha } },
  };
  assert.equal(previewRequest(env, event).sha, sha);
  for (const changed of [
    { ...env, GITHUB_EVENT_NAME: "pull_request" },
    { ...env, GITHUB_REF: "refs/pull/17/merge" },
    { ...env, PREVIEW_PR: "18" },
    { ...env, PREVIEW_SHA: "b".repeat(40) },
  ])
    assert.throws(() => previewRequest(changed, event));
  assert.throws(() => previewRequest(env, { ...event, action: "closed" }));
  assert.equal(
    previewRequest({ ...env, GITHUB_EVENT_NAME: "workflow_dispatch" }, {}).pr,
    17,
  );
  assert.throws(() => approvePreview(request, { ...pr, draft: true }));
  assert.throws(() =>
    approvePreview(request, { ...pr, user: { login: "service", type: "Bot" } }),
  );
});

test("PR addresses are distinct and stay within the reserved team namespace", () => {
  assert.equal(previewAlias(28), "bottom-shelf-pr-28.visegue.vercel.app");
  assert.notEqual(previewAlias(28), previewAlias(29));
  for (const bad of [0, -1, 1.5, "28", NaN, Infinity])
    assert.throws(() => previewAlias(bad));
});
