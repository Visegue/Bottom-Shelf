import { readApprovedSource } from "./preview-source.mjs";
import { appendFile } from "node:fs/promises";
import { PreviewError, previewRuntime } from "./preview-policy.mjs";
import { approvedPreview as approved } from "./preview-approval.mjs";
import { verifyStorageTarget } from "./environment-target.mjs";
import { previewSandbox } from "./preview-sandbox.mjs";
import { deployPreview } from "./deploy-preview.mjs";

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
      { ...request, files, runtime },
      { token: process.env.VERCEL_TOKEN, verifyApproval: approved },
    );
    console.log(
      `PR preview smoke passed: ${url} (${request.sha}). Real Google/session verification remains separate.`,
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
