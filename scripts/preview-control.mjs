import { readApprovedSource } from "./preview-source.mjs";
import { appendFile } from "node:fs/promises";
import {
  PreviewError,
  approvePreview,
  previewRuntime,
  repository,
} from "./preview-policy.mjs";
import { verifyStorageTarget } from "./environment-target.mjs";
import { previewSandbox } from "./preview-sandbox.mjs";
import { deployPreview } from "./deploy-preview.mjs";

async function approved() {
  if (
    process.env.GITHUB_REPOSITORY !== repository ||
    process.env.GITHUB_REF !== "refs/heads/main"
  )
    throw new PreviewError(
      "Dispatch preview from the repository's protected main",
    );
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
    get(`pulls/${process.env.PREVIEW_PR}`),
    get(
      `collaborators/${encodeURIComponent(process.env.GITHUB_ACTOR)}/permission`,
    ),
    get("git/ref/heads/main"),
  ]);
  if (main.object.sha !== process.env.GITHUB_SHA)
    throw new PreviewError("Main moved; dispatch again");
  return approvePreview(
    {
      pr: Number(process.env.PREVIEW_PR),
      sha: process.env.PREVIEW_SHA,
      actorPermission: actor.permission,
      ref: process.env.GITHUB_REF,
    },
    pull,
  );
}

try {
  const request = await approved();
  if (process.argv[2] === "approve") {
    await appendFile(process.env.GITHUB_OUTPUT, `sha=${request.sha}\n`);
  } else if (process.argv[2] === "deploy") {
    const runtime = previewRuntime(process.env);
    verifyStorageTarget(runtime);
    if (!process.env.DATABASE_MIGRATION_URL)
      throw new PreviewError("Preview migration credential required");
    const input = {
      runtime,
      migration: {
        APP_ENV: "preview",
        DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL,
      },
    };
    const result = previewSandbox("migrations", {
      env: { ...process.env, PREVIEW_INPUT: JSON.stringify(input) },
    });
    if (result.error || result.status !== 0)
      throw new PreviewError(
        "Preview migration/check failed; private output withheld",
      );
    const files = readApprovedSource(request.sha);
    const url = await deployPreview(
      { sha: request.sha, files, runtime },
      { token: process.env.VERCEL_TOKEN, verifyApproval: approved },
    );
    console.log(
      `Shared preview smoke passed: ${url} (${request.sha}). Real Google/session verification remains separate.`,
    );
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `url=${url}\n`);
  } else throw new PreviewError("Unknown preview action");
} catch (error) {
  console.error(
    error instanceof PreviewError
      ? error.message
      : "Preview failed; private diagnostics withheld",
  );
  process.exitCode = 1;
}
