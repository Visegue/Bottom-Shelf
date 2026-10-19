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
