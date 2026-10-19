import { test } from "node:test";
import assert from "node:assert/strict";
import { environmentTarget } from "../../scripts/environment-target.mjs";
test("shared preview uses the pinned environment and rejects caller-controlled target replacement", () => {
  let actual;
  try {
    actual = environmentTarget({ APP_ENV: "preview" });
  } catch {
    actual = { branchId: "unprovisioned" };
  }
  assert.equal(actual.branchId, "br-holy-bird-barhw055");
  assert.throws(
    () => environmentTarget({ APP_ENV: "preview", PREVIEW_TARGET: "{}" }),
    /override|fixed/i,
  );
});

test("shared preview refuses copied parent storage credentials", async () => {
  const { verifyStorageTarget } =
    await import("../../scripts/environment-target.mjs");
  const env = {
    APP_ENV: "preview",
    AWS_REGION: "eu-central-1",
    STORAGE_BUCKET: "preview-images",
    AWS_ENDPOINT_URL_S3:
      "https://br-holy-bird-barhw055.storage.c-8.eu-central-1.aws.neon.tech",
    AWS_ACCESS_KEY_ID: "copied-parent-key",
  };
  assert.throws(() => verifyStorageTarget(env), /Storage target verification/);
});

test("runtime configuration excludes management and migration credentials", async () => {
  const { previewRuntime } = await import("../../scripts/preview-policy.mjs");
  const env = {
    APP_ENV: "preview",
    DATABASE_URL: "runtime",
    DATABASE_MIGRATION_URL: "migration-private",
    NEON_API_KEY: "management-private",
    VERCEL_TOKEN: "vercel-private",
  };
  for (const key of [
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
    "OWNER_USER_ID",
    "OWNER_EMAIL",
    "AWS_ENDPOINT_URL_S3",
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "STORAGE_BUCKET",
  ])
    env[key] = "fixture";
  const runtime = previewRuntime(env);
  assert.doesNotMatch(
    JSON.stringify(runtime),
    /migration-private|management-private|vercel-private/,
  );
  assert.equal(runtime.DATABASE_URL, "runtime");
});

test("deployment uses only project APIs and moves the shared alias after successful smoke and approval", async () => {
  const { deployPreview } = await import("../../scripts/deploy-preview.mjs");
  const { vercelProject, vercelTeam, previewAlias } =
    await import("../../scripts/preview-policy.mjs");
  const sha = "a".repeat(40),
    events = [];
  let created;
  const options = {
    token: "scoped-token",
    pause: async () => {},
    verifyApproval: async () => {
      events.push("approval");
    },
    fetchApi: async (url, init) => {
      const path = url.pathname;
      assert.doesNotMatch(path, /teams|billing/);
      if (path === `/v9/projects/${vercelProject}`)
        return Response.json({
          id: vercelProject,
          accountId: vercelTeam,
          name: "bottom-shelf",
        });
      if (path.endsWith("/env")) return Response.json({ envs: [] });
      if (path === "/v13/deployments") {
        created = JSON.parse(init.body);
        assert.equal(created.target, undefined);
        assert.equal(created.project, vercelProject);
        return Response.json({
          id: "dpl_fixture",
          projectId: vercelProject,
          url: "fixture.vercel.app",
        });
      }
      if (path === "/v13/deployments/dpl_fixture")
        return Response.json({
          readyState: "READY",
          projectId: vercelProject,
          meta: { approvedSHA: sha },
        });
      if (path.endsWith("/aliases")) {
        events.push("alias");
        assert.equal(JSON.parse(init.body).alias, previewAlias);
        return Response.json({ alias: previewAlias });
      }
      if (path.startsWith("/v4/aliases/"))
        return Response.json({
          projectId: vercelProject,
          deploymentId: "dpl_fixture",
        });
      throw new Error("Unexpected API path");
    },
    fetchPage: async (url) => {
      events.push("smoke");
      return url.pathname === "/"
        ? new Response("Bottom Shelf Fortsätt med Google", {
            headers: { "content-type": "text/html" },
          })
        : Response.json(
            { error: "unauthorized" },
            { status: 401, headers: { "cache-control": "no-store" } },
          );
    },
  };
  assert.equal(
    await deployPreview(
      { sha, files: [], runtime: { DATABASE_URL: "runtime-only" } },
      options,
    ),
    `https://${previewAlias}`,
  );
  assert.deepEqual(events, ["smoke", "smoke", "approval", "alias"]);
  assert.deepEqual(created.env, { DATABASE_URL: "runtime-only" });
  events.length = 0;
  await assert.rejects(
    deployPreview(
      { sha, files: [], runtime: {} },
      {
        ...options,
        fetchPage: async () => new Response("unavailable", { status: 503 }),
      },
    ),
    /landing page/,
  );
  assert.equal(events.includes("alias"), false);
  events.length = 0;
  await assert.rejects(
    deployPreview(
      { sha, files: [], runtime: {} },
      {
        ...options,
        verifyApproval: async () => {
          throw new Error("PR moved");
        },
      },
    ),
    /PR moved/,
  );
  assert.equal(events.includes("alias"), false);
});

test("candidate Git replacements cannot change pristine deployment bytes", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const { readApprovedSource } =
    await import("../../scripts/preview-source.mjs");
  const root = await mkdtemp(join(tmpdir(), "bs-pristine-source-"));
  const git = (cwd, ...args) =>
    execFileSync(
      "git",
      [
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "-C",
        cwd,
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  try {
    const source = join(root, "source"),
      candidate = join(root, "candidate");
    await mkdir(source);
    git(source, "init");
    await writeFile(join(source, "app.txt"), "approved bytes");
    git(source, "add", ".");
    git(source, "commit", "-m", "fixture");
    const sha = git(source, "rev-parse", "HEAD");
    git(root, "clone", source, candidate);
    await writeFile(join(candidate, "app.txt"), "unreviewed bytes");
    git(candidate, "add", ".");
    git(candidate, "commit", "-m", "replacement");
    const replacement = git(candidate, "rev-parse", "HEAD");
    git(candidate, "reset", "--hard", sha);
    git(candidate, "replace", sha, replacement);
    assert.equal(git(candidate, "rev-parse", "HEAD"), sha);
    assert.equal(git(candidate, "show", `${sha}:app.txt`), "unreviewed bytes");
    const files = readApprovedSource(sha, { root });
    assert.equal(
      Buffer.from(
        files.find((x) => x.file === "app.txt").data,
        "base64",
      ).toString(),
      "approved bytes",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
