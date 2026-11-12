import { readFile } from "node:fs/promises";
import {
  PreviewError,
  approvePreview,
  repository,
  previewRequest,
} from "./preview-policy.mjs";

export async function approvedPreview(env = process.env, fetchApi = fetch) {
  const identity = previewRequest(
    env,
    JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8")),
  );
  const get = async (path) => {
    const response = await fetchApi(
      `https://api.github.com/repos/${repository}/${path}`,
      {
        headers: { Authorization: `Bearer ${env.GH_TOKEN}` },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new PreviewError("Cannot verify approved PR identity");
    return response.json();
  };
  const [pull, actor, main] = await Promise.all([
    get(`pulls/${identity.pr}`),
    get(
      `collaborators/${encodeURIComponent(env.GITHUB_TRIGGERING_ACTOR || env.GITHUB_ACTOR)}/permission`,
    ),
    get("git/ref/heads/main"),
  ]);
  if (main.object.sha !== env.GITHUB_SHA)
    throw new PreviewError("Main moved; start a new preview from current main");
  return approvePreview(
    { ...identity, actorPermission: actor.permission },
    pull,
  );
}
