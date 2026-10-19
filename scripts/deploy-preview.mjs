import {
  PreviewError,
  vercelProject,
  vercelTeam,
  previewAlias,
} from "./preview-policy.mjs";
import { smokeDeployment } from "./smoke-deployment.mjs";
import { vercelFetch } from "./vercel-fetch.mjs";

// Source files and runtime values are supplied by trusted main, never executed here.
export async function deployPreview(
  { sha, files, runtime },
  {
    token,
    fetchApi = fetch,
    fetchPage = vercelFetch,
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    verifyApproval = async () => {},
  } = {},
) {
  if (!token || !/^[a-f0-9]{40}$/.test(sha))
    throw new PreviewError(
      "Approved preview revision and project token required",
    );
  async function api(path, body, allowMissing = false) {
    const url = new URL("https://api.vercel.com" + path);
    url.searchParams.set("teamId", vercelTeam);
    const response = await fetchApi(url, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok)
      throw new PreviewError(
        `Vercel preview request failed (${response.status}); existing preview data preserved`,
      );
    return response.json();
  }
  const project = await api(`/v9/projects/${vercelProject}`);
  const variables = await api(`/v10/projects/${vercelProject}/env`);
  if (
    project.id !== vercelProject ||
    project.accountId !== vercelTeam ||
    !Array.isArray(variables.envs) ||
    variables.envs.some((item) => item.target?.includes("preview"))
  )
    throw new PreviewError(
      "Preview requires the pinned project and no inherited Preview variables",
    );
  const previousAlias = await api(
    `/v4/aliases/${previewAlias}`,
    undefined,
    true,
  );
  if (previousAlias && previousAlias.projectId !== vercelProject)
    throw new PreviewError("Shared preview address belongs to another project");
  const created = await api("/v13/deployments", {
    name: project.name,
    project: vercelProject,
    files,
    env: runtime,
    build: { env: runtime },
    meta: { approvedSHA: sha },
    projectSettings: {
      framework: "nextjs",
      installCommand: "npm ci",
      buildCommand: "npm run build",
      nodeVersion: "24.x",
    },
  });
  if (
    !created.id ||
    created.projectId !== vercelProject ||
    created.target != null ||
    !/^[a-z0-9-]+\.vercel\.app$/.test(created.url)
  )
    throw new PreviewError(
      "Created deployment is not the expected Preview target",
    );
  let ready;
  for (let attempt = 0; attempt < 120; attempt++) {
    ready = await api(`/v13/deployments/${created.id}`);
    if (
      ready.projectId !== vercelProject ||
      ready.target != null ||
      ready.meta?.approvedSHA !== sha
    )
      throw new PreviewError("Preview deployment identity changed");
    if (ready.readyState === "READY") break;
    if (["ERROR", "CANCELED"].includes(ready.readyState))
      throw new PreviewError("Preview build failed; stable address unchanged");
    await pause(5000);
  }
  if (ready.readyState !== "READY")
    throw new PreviewError("Preview build timed out; stable address unchanged");
  await smokeDeployment(`https://${created.url}`, fetchPage);
  await verifyApproval();
  await api(`/v2/deployments/${created.id}/aliases`, { alias: previewAlias });
  const alias = await api(`/v4/aliases/${previewAlias}`);
  if (alias.projectId !== vercelProject || alias.deploymentId !== created.id)
    throw new PreviewError("Stable preview address was not verified");
  return `https://${previewAlias}`;
}
