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
  { pr, branch, sha, files, runtime },
  {
    token,
    fetchApi = fetch,
    fetchPage = vercelFetch,
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    verifyApproval = async () => {},
  } = {},
) {
  if (!token || !branch || !/^[a-f0-9]{40}$/.test(sha))
    throw new PreviewError(
      "Approved preview revision and project token required",
    );
  async function api(path, body, allowMissing = false, method) {
    const url = new URL("https://api.vercel.com" + path);
    url.searchParams.set("teamId", vercelTeam);
    const response = await fetchApi(url, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (allowMissing && response.status === 404) return null;
    if (allowMissing && response.status === 204) return null;
    if (!response.ok)
      throw new PreviewError(
        `Vercel preview request failed (${response.status}); existing preview data preserved`,
      );
    return response.json();
  }
  const aliasName = previewAlias(pr);
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
  const previousAlias = await api(`/v4/aliases/${aliasName}`, undefined, true);
  if (previousAlias && previousAlias.projectId !== vercelProject)
    throw new PreviewError("PR preview address belongs to another project");
  const domains = await api(`/v9/projects/${vercelProject}/domains?limit=100`);
  if (!Array.isArray(domains.domains) || domains.pagination?.next)
    throw new PreviewError(
      "Cannot audit all PR aliases within the approved preview capacity",
    );
  const otherAliases = [];
  for (const domain of domains.domains) {
    if (
      domain.name === aliasName ||
      !/^bottom-shelf-pr-[1-9][0-9]*\.visegue\.vercel\.app$/.test(domain.name)
    )
      continue;
    const existing = await api(`/v4/aliases/${domain.name}`, undefined, true);
    if (
      existing &&
      (existing.projectId !== vercelProject || !existing.deploymentId)
    )
      throw new PreviewError(
        "Another PR alias has an unexpected project/deployment identity",
      );
    otherAliases.push({
      name: domain.name,
      deploymentId: existing?.deploymentId ?? null,
    });
  }
  let domain = await api(
    `/v9/projects/${vercelProject}/domains/${aliasName}`,
    undefined,
    true,
  );
  if (!domain)
    domain = await api(`/v10/projects/${vercelProject}/domains`, {
      name: aliasName,
      gitBranch: branch,
    });
  if (
    domain.projectId !== vercelProject ||
    domain.gitBranch !== branch ||
    !domain.verified
  )
    throw new PreviewError(
      "PR domain is not assigned to the expected project and branch",
    );
  const created = await api("/v13/deployments", {
    name: project.name,
    project: vercelProject,
    files,
    env: runtime,
    build: { env: runtime },
    meta: { approvedSHA: sha, previewPR: String(pr) },
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
      ready.meta?.approvedSHA !== sha ||
      ready.meta?.previewPR !== String(pr)
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
  try {
    await api(`/v2/deployments/${created.id}/aliases`, { alias: aliasName });
    const alias = await api(`/v4/aliases/${aliasName}`);
    if (alias.projectId !== vercelProject || alias.deploymentId !== created.id)
      throw new PreviewError("PR preview address was not verified");
    // A new team subdomain may need a short certificate propagation delay.
    for (let attempt = 0; ; attempt++) {
      try {
        await smokeDeployment(`https://${aliasName}`, fetchPage);
        break;
      } catch (error) {
        if (attempt >= 11) throw error;
        await pause(5000);
      }
    }
    for (const previous of otherAliases) {
      const current = await api(
        `/v4/aliases/${previous.name}`,
        undefined,
        true,
      );
      if (
        (current?.deploymentId ?? null) !== previous.deploymentId ||
        (current && current.projectId !== vercelProject)
      )
        throw new PreviewError(
          "Another PR alias changed during publication; shared data preserved",
        );
    }
    console.log(
      `Verified ${otherAliases.length} other PR preview aliases unchanged.`,
    );
  } catch (error) {
    // Only undo our own alias assignment. Schema/data changes remain applied.
    try {
      const current = await api(`/v4/aliases/${aliasName}`, undefined, true);
      if (
        current?.projectId === vercelProject &&
        current.deploymentId === created.id
      ) {
        if (previousAlias?.deploymentId) {
          await api(`/v2/deployments/${previousAlias.deploymentId}/aliases`, {
            alias: aliasName,
          });
          const restored = await api(`/v4/aliases/${aliasName}`);
          if (
            restored.projectId !== vercelProject ||
            restored.deploymentId !== previousAlias.deploymentId
          )
            throw new Error("Alias restoration was not confirmed", {
              cause: error,
            });
        } else {
          await api(`/v2/aliases/${aliasName}`, undefined, true, "DELETE");
          if (await api(`/v4/aliases/${aliasName}`, undefined, true))
            throw new Error("Failed first alias still exists", {
              cause: error,
            });
        }
      } else if (current && current.projectId !== vercelProject) {
        throw new Error("Alias ownership changed", { cause: error });
      }
    } catch (recoveryError) {
      throw new PreviewError(
        "PR alias recovery could not be verified; inspect the alias manually. Database migrations remain applied.",
        { cause: recoveryError },
      );
    }
    throw error;
  }
  return `https://${aliasName}`;
}
