export class PreviewError extends Error {}
export const previewProject = "blue-bar-96694914";
export const previewParent = "br-mute-art-baqyyyu3";
export const vercelProject = "prj_9mmJV4XIqdZyvhtpwh2amkiQS2k6";
export const vercelTeam = "team_J9VXW7YbzLRuOTDPUyQTpEUP";
export const repository = "Visegue/Bottom-Shelf";
export function approvePreview(request, pr) {
  if (
    request.ref !== "refs/heads/main" ||
    !["admin", "maintain", "write"].includes(request.actorPermission) ||
    !Number.isSafeInteger(request.pr) ||
    request.pr < 1 ||
    !/^[a-f0-9]{40}$/.test(request.sha) ||
    pr.number !== request.pr ||
    pr.state !== "open" ||
    pr.draft ||
    pr.head.sha !== request.sha ||
    pr.head.repo?.full_name !== repository ||
    pr.base.repo?.full_name !== repository ||
    pr.base.ref !== "main" ||
    pr.user.login.endsWith("[bot]")
  )
    throw new PreviewError(
      "Preview requires an exact approved same-repository PR revision on main",
    );
  return { pr: request.pr, sha: request.sha };
}
export function requirePreviewCapacity(
  { neonPlan, branchLimit, branches, vercelPlan, vercelDaily, vercelActive },
  needed = 1,
) {
  if (neonPlan !== "free_v3" || vercelPlan !== "hobby")
    throw new PreviewError(
      "Free plans must be verified; no automatic paid provisioning",
    );
  if (
    !Number.isInteger(vercelDaily) ||
    vercelDaily < 0 ||
    vercelDaily >= 100 ||
    vercelActive !== 0
  )
    throw new PreviewError(
      "Vercel free preview capacity exhausted or unknown; wait and retry",
    );
  if (
    !Number.isInteger(branchLimit) ||
    branchLimit > 10 ||
    !Number.isInteger(branches) ||
    branches < 0 ||
    branches + needed > branchLimit
  )
    throw new PreviewError(
      "Preview capacity exhausted or unknown; wait for explicit cleanup",
    );
}
