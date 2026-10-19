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
export const previewAlias = "bottom-shelf-preview.vercel.app";
export function previewRuntime(env) {
  if (env.APP_ENV !== "preview")
    throw new PreviewError("Fixed preview configuration required");
  const runtime = { APP_ENV: "preview", FOUNDATION_CHECK_ENABLED: "true" };
  for (const key of [
    "DATABASE_URL",
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
    "OWNER_USER_ID",
    "OWNER_EMAIL",
    "AWS_ENDPOINT_URL_S3",
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "STORAGE_BUCKET",
  ]) {
    if (!env[key])
      throw new PreviewError(`Missing preview configuration: ${key}`);
    runtime[key] = env[key];
  }
  return runtime;
}
