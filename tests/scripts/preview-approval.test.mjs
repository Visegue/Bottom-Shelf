import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approvedPreview } from "../../scripts/preview-approval.mjs";

test("approval retries transient metadata failures but fails closed with safe HTTP diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "bs-preview-approval-"));
  const sha = "a".repeat(40),
    control = "b".repeat(40);
  const event = join(root, "event.json");
  await writeFile(event, "{}");
  const env = {
    GITHUB_EVENT_PATH: event,
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: "Visegue/Bottom-Shelf",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: control,
    GITHUB_ACTOR: "writer",
    PREVIEW_PR: "38",
    PREVIEW_SHA: sha,
  };
  let attempts = 0;
  const fetchApi = async (url) => {
    if (url.endsWith("pulls/38")) {
      if (++attempts === 1)
        return new Response("private provider details", { status: 503 });
      return Response.json({
        number: 38,
        state: "open",
        draft: false,
        user: { login: "owner", type: "User" },
        head: { sha, repo: { full_name: "Visegue/Bottom-Shelf" } },
        base: { ref: "main", repo: { full_name: "Visegue/Bottom-Shelf" } },
      });
    }
    if (url.endsWith("/permission"))
      return Response.json({ permission: "write", user: { type: "User" } });
    return Response.json({ object: { sha: control } });
  };
  try {
    assert.equal(
      (await approvedPreview(env, fetchApi, async () => {})).sha,
      sha,
    );
    assert.equal(attempts, 2);
    await assert.rejects(
      approvedPreview(
        env,
        async () => new Response("private provider details", { status: 403 }),
      ),
      (error) =>
        /HTTP 403/.test(error.message) &&
        !error.message.includes("private provider details"),
    );
    await assert.rejects(
      approvedPreview({ ...env, GITHUB_ACTOR: "dependabot[bot]" }, fetchApi),
      /human writer/,
    );
    await assert.rejects(
      approvedPreview({ ...env, GITHUB_SHA: "c".repeat(40) }, fetchApi),
      /Main moved/,
    );
    await assert.rejects(
      approvedPreview({ ...env, PREVIEW_SHA: "d".repeat(40) }, fetchApi),
      /exact approved/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
