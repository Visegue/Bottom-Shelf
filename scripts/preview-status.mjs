import { pathToFileURL } from "node:url";
import { approvedPreview } from "./preview-approval.mjs";
import { PreviewError, previewAlias, repository } from "./preview-policy.mjs";

export const previewContext = "Preview / verified";

export async function reportPreview(
  phase,
  {
    env = process.env,
    approve = () => approvedPreview(env),
    fetchApi = fetch,
  } = {},
) {
  if (!["pending", "complete"].includes(phase))
    throw new PreviewError("Unknown preview report phase");
  const request = await approve();
  if (!/^\d+$/.test(env.GITHUB_RUN_ID ?? ""))
    throw new PreviewError("GitHub run identity required for preview evidence");
  const success =
    phase === "complete" &&
    env.PREVIEW_RESULT === "success" &&
    env.PREVIEW_JOB_STATUS === "success" &&
    env.PREVIEW_URL === `https://${previewAlias(request.pr)}`;
  const state =
    phase === "pending" ? "pending" : success ? "success" : "failure";
  const response = await fetchApi(
    `https://api.github.com/repos/${repository}/statuses/${request.sha}`,
    {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state,
        context: previewContext,
        description:
          phase === "pending"
            ? "Exact PR revision: tests, migrations and preview smoke pending"
            : success
              ? "Exact PR revision passed tests, migrations and PR alias smoke"
              : "Preview verification failed or did not complete",
        target_url: `https://github.com/${repository}/actions/runs/${env.GITHUB_RUN_ID}`,
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new PreviewError("Cannot publish exact-head preview evidence");
  return state;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(`Preview status: ${await reportPreview(process.argv[2])}`);
  } catch (error) {
    console.error(
      error instanceof PreviewError ? error.message : "Preview report failed",
    );
    process.exitCode = 1;
  }
}
