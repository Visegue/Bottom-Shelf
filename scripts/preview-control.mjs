import { randomBytes } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  PreviewError,
  approvePreview,
  requirePreviewCapacity,
  repository,
  vercelProject,
  vercelTeam,
} from "./preview-policy.mjs";
import {
  preparePreview,
  cleanupPreview,
  verifyPreviewBranch,
} from "./preview-lifecycle.mjs";
import { previewProvider, previewRuntime } from "./preview-provider.mjs";
import { smokeDeployment } from "./smoke-deployment.mjs";
import { vercelFetch } from "./vercel-fetch.mjs";

const action = process.argv[2];
async function output(name, value) {
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
async function approved() {
  if (
    process.env.GITHUB_REPOSITORY !== repository ||
    process.env.GITHUB_REF !== "refs/heads/main"
  )
    throw new PreviewError(
      "Trusted preview workflow must run from repository main",
    );
  const pr = Number(process.env.PREVIEW_PR),
    sha = process.env.PREVIEW_SHA;
  if (!Number.isSafeInteger(pr) || pr < 1)
    throw new PreviewError("Invalid approved PR");
  const get = async (path) => {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/${path}`,
      {
        headers: { Authorization: `Bearer ${process.env.GH_TOKEN}` },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new PreviewError("Cannot verify approved PR identity");
    return response.json();
  };
  const [pull, actor, main] = await Promise.all([
    get(`pulls/${pr}`),
    get(
      `collaborators/${encodeURIComponent(process.env.GITHUB_ACTOR)}/permission`,
    ),
    get("git/ref/heads/main"),
  ]);
  if (main.object.sha !== process.env.GITHUB_SHA)
    throw new PreviewError("Main changed; dispatch again from current main");
  if (action === "cleanup" || process.env.PREVIEW_ACTION === "cleanup") {
    if (!["admin", "maintain", "write"].includes(actor.permission))
      throw new PreviewError("Cleanup requires a trusted operator");
    return { pr, sha };
  }
  return approvePreview(
    { pr, sha, ref: process.env.GITHUB_REF, actorPermission: actor.permission },
    pull,
  );
}
function git(args, options = {}) {
  const result = spawnSync("git", args, { encoding: "utf8", ...options });
  if (result.status !== 0 || result.error)
    throw new PreviewError("Cannot read exact approved source");
  return result.stdout;
}
try {
  const request = await approved();
  if (action === "approve") {
    await output("sha", request.sha);
  } else {
    const api = previewProvider();
    let record = await api.load();
    if (record && record.pr !== request.pr)
      throw new PreviewError("Registry PR identity differs");
    if (action === "cleanup") {
      if (record) await cleanupPreview(record, api);
      console.log(
        "Explicit preview cleanup complete; protected resources preserved.",
      );
    } else if (action === "prepare") {
      if (!record || record.status === "deleted")
        record = {
          pr: request.pr,
          token: randomBytes(8).toString("hex"),
          deployments: [],
          previousSha: process.env.GITHUB_SHA,
        };
      record.name = `preview-${record.pr}-${record.token}`;
      record.sha = request.sha;
      record.trustedSha = process.env.GITHUB_SHA;
      await preparePreview(record, api);
      const preview = previewRuntime(record),
        probe = previewRuntime(record, process.env, "bs_probe");
      const input = {
        sha: record.sha,
        previousSha: record.previousSha,
        preview,
        probe,
        reference: JSON.parse(process.env.PREVIEW_REFERENCE),
      };
      const environment = `preview-${record.pr}-migration`;
      await api.executionEnvironment(environment, input);
      await output("environment", environment);
      await output("previous_sha", record.previousSha);
      console.log(
        "Registered preview prepared; only scoped credentials released to isolated execution.",
      );
    } else if (action === "deploy") {
      if (
        !record ||
        record.sha !== request.sha ||
        record.trustedSha !== process.env.GITHUB_SHA ||
        record.status !== "prepared"
      )
        throw new PreviewError(
          "Preview registry does not match this approved execution",
        );
      verifyPreviewBranch(record, await api.branch(record.branchId));
      // Non-git source upload with target omitted is the documented Preview API path.
      // No install, build, npm script, migration or uploaded executable runs here.
      const source = process.env.PREVIEW_SOURCE;
      if (git(["-C", source, "rev-parse", "HEAD"]).trim() !== record.sha)
        throw new PreviewError("Approved source checkout differs");
      const entries = git([
        "-C",
        source,
        "ls-tree",
        "-rz",
        "--full-tree",
        record.sha,
      ])
        .split("\0")
        .filter(Boolean);
      const files = [];
      for (const entry of entries) {
        const [header, file] = entry.split("\t");
        if (
          !/^100(?:644|755) blob /.test(header) ||
          file.split("/").some((part) => part === ".." || part === ".git") ||
          (file.startsWith(".env") && file !== ".env.example")
        )
          throw new PreviewError(
            "Unsupported or private file in approved source",
          );
        const data = git(["-C", source, "show", `${record.sha}:${file}`], {
          encoding: null,
        });
        if (file === "vercel.json") {
          const config = JSON.parse(data);
          if (config.env || config.build?.env)
            throw new PreviewError(
              "Preview source may not override scoped deployment credentials",
            );
        }
        files.push({ file, data: data.toString("base64"), encoding: "base64" });
      }
      if (JSON.stringify(files).length > 4000000)
        throw new PreviewError(
          "Preview source upload exceeds reviewed inline capacity",
        );
      requirePreviewCapacity(await api.capacity(), 0);
      const project = await api.vercel(`/v9/projects/${vercelProject}`);
      const variables = await api.vercel(`/v10/projects/${vercelProject}/env`);
      if (
        project?.id !== vercelProject ||
        project.accountId !== vercelTeam ||
        !Array.isArray(variables?.envs) ||
        variables.envs.some((item) => item.target?.includes("preview"))
      )
        throw new PreviewError(
          "Preview requires a verified project with no inherited Preview secrets",
        );
      const { runtime } = previewRuntime(record);
      const created = await api.vercel("/v13/deployments", "POST", {
        name: project.name,
        project: vercelProject,
        files,
        env: runtime,
        build: { env: runtime },
        meta: { bottomShelfPreview: record.token, approvedSHA: record.sha },
        projectSettings: {
          framework: "nextjs",
          installCommand: "npm ci",
          buildCommand: "npm run build",
          nodeVersion: "24.x",
        },
      });
      if (
        !created ||
        created.target != null ||
        created.projectId !== vercelProject ||
        !/^[a-z0-9-]+\.vercel\.app$/.test(created.url)
      )
        throw new PreviewError(
          "Created deployment is not the registered Preview target; inspect before retry",
        );
      record.deployments.push({ id: created.id, url: created.url });
      record.status = "deploying";
      await api.save(record);
      let ready;
      for (let attempt = 0; attempt < 120; attempt++) {
        ready = await api.deployment(created.id);
        if (
          !ready ||
          ready.target != null ||
          ready.projectId !== vercelProject ||
          ready.meta?.approvedSHA !== record.sha
        )
          throw new PreviewError("Deployment revision or target differs");
        if (ready.readyState === "READY") break;
        if (["ERROR", "CANCELED"].includes(ready.readyState))
          throw new PreviewError(
            "Preview build failed; registry retained for cleanup",
          );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      if (ready.readyState !== "READY")
        throw new PreviewError(
          "Preview build pending; inspect registered deployment",
        );
      const url = `https://${created.url}`;
      // Real browser login uses the exact direct URL. No wildcard or shared alias is created.
      await api.addOrigin(url);
      await smokeDeployment(url, vercelFetch);
      record.status = "awaiting-google-integration";
      record.previousSha = record.sha;
      await api.save(record);
      console.log(
        `Preview smoke passed for ${record.sha}: ${url}. Real Google/session/owner/private-image verification remains required.`,
      );
      await output("url", url);
    } else throw new PreviewError("Unknown explicit preview action");
  }
} catch (error) {
  if (error instanceof PreviewError) console.error(error.message);
  // Provider bodies, SQL errors and execution inputs can contain secrets. Never print them.
  console.error(
    "Preview operation stopped. Inspect the trusted registry and docs/setup/preview.md; no success or integration approval recorded.",
  );
  process.exitCode = 1;
}
