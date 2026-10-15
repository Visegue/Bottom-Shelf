import { setTimeout } from "node:timers/promises";

// The CLI's promote command requires a user profile even for a team token.
// Use its project-scoped API directly and verify the resulting production target.
export async function promoteDeployment(
  input,
  { projectId, orgId, token },
  request = fetch,
) {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.vercel\.app$/i.test(url.hostname) ||
    !/^prj_[a-z0-9]+$/i.test(projectId) ||
    !/^team_[a-z0-9]+$/i.test(orgId) ||
    !token
  )
    throw new Error("Invalid promotion context");
  async function api(path, method = "GET") {
    const response = await request(
      `https://api.vercel.com${path}?teamId=${encodeURIComponent(orgId)}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(method === "POST" ? { body: "{}" } : {}),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new Error(`Vercel promotion API failed (${response.status})`);
    return response;
  }
  const deployment = await (
    await api(`/v13/deployments/${url.hostname}`)
  ).json();
  if (
    deployment.projectId !== projectId ||
    deployment.ownerId !== orgId ||
    deployment.target !== "production" ||
    deployment.readyState !== "READY" ||
    !/^dpl_[a-z0-9]+$/i.test(deployment.id)
  )
    throw new Error("Unexpected staged deployment; promotion refused");
  await api(`/v10/projects/${projectId}/promote/${deployment.id}`, "POST");
  const deadline = Date.now() + 60000;
  do {
    const project = await (await api(`/v9/projects/${projectId}`)).json();
    if (project.targets?.production?.id === deployment.id) return;
    await setTimeout(1000);
  } while (Date.now() < deadline);
  throw new Error("Vercel promotion was not confirmed within 60 seconds");
}
