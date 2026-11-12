import { readFile } from "node:fs/promises";
import {
  PreviewError,
  approvePreview,
  repository,
  previewRequest,
} from "./preview-policy.mjs";

export async function approvedPreview(
  env = process.env,
  fetchApi = fetch,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const identity = previewRequest(
    env,
    JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8")),
  );
  const actorName = env.GITHUB_TRIGGERING_ACTOR || env.GITHUB_ACTOR;
  if (!actorName || actorName.endsWith("[bot]"))
    throw new PreviewError("A human writer must request preview verification");
  const get = async (path, label) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetchApi(
        `https://api.github.com/repos/${repository}/${path}`,
        {
          headers: { Authorization: `Bearer ${env.GH_TOKEN}` },
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (response.ok) return response.json();
      const wait = Number(response.headers.get("retry-after") ?? 1);
      if (
        attempt < 2 &&
        (response.status === 429 || response.status >= 500) &&
        wait >= 0 &&
        wait <= 5
      ) {
        await response.body?.cancel();
        await pause(wait * 1000);
        continue;
      }
      throw new PreviewError(
        `Cannot verify ${label} (GitHub HTTP ${response.status}); no preview approval granted`,
      );
    }
  };
  const [pull, actor, main] = await Promise.all([
    get(`pulls/${identity.pr}`, "PR identity"),
    get(
      `collaborators/${encodeURIComponent(actorName)}/permission`,
      "writer permission",
    ),
    get("git/ref/heads/main", "control main"),
  ]);
  if (actor.user?.type === "Bot")
    throw new PreviewError("A human writer must request preview verification");
  if (main.object.sha !== env.GITHUB_SHA)
    throw new PreviewError("Main moved; start a new preview from current main");
  return approvePreview(
    { ...identity, actorPermission: actor.permission },
    pull,
  );
}
