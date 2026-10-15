import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { smokeDeployment } from "./smoke-deployment.mjs";
import { vercelFetch } from "./vercel-fetch.mjs";

const scope = process.env.VERCEL_SCOPE ?? "visegue";
const expectedProject = "prj_9mmJV4XIqdZyvhtpwh2amkiQS2k6";
if (process.env.APP_ENV !== "test")
  throw new Error("Only the isolated test app is supported");
if (
  process.env.CI &&
  (process.env.GITHUB_REF !== "refs/heads/main" || !process.env.VERCEL_TOKEN)
) {
  throw new Error("CI deployments require main and VERCEL_TOKEN");
}
if (
  process.env.VERCEL_PROJECT_ID &&
  process.env.VERCEL_PROJECT_ID !== expectedProject
) {
  throw new Error("Unexpected Vercel project");
}
if (!process.env.VERCEL_PROJECT_ID) {
  const link = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
  if (link.projectId !== expectedProject)
    throw new Error("Unexpected local Vercel project");
}
function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} failed; inspect the operation without printing secrets`,
    );
  return result.stdout?.trim();
}
try {
  // Vercel rebuilds from source with the test environment; never deploy build:check output.
  const output = run(
    "npx",
    [
      "--yes",
      "vercel@63.1.2",
      "deploy",
      "--prod",
      "--skip-domain",
      "--yes",
      "--scope",
      scope,
      "--no-color",
    ],
    true,
  );
  const url = output.match(/https:\/\/[a-z0-9-]+\.vercel\.app\/?/i)?.[0];
  if (!url) throw new Error("Vercel did not return a deployment URL");
  console.log("Test deployment staged:", url);
  run(process.execPath, ["scripts/migrate.mjs"]);
  run(process.execPath, ["scripts/check-database.mjs"]);
  await smokeDeployment(url, vercelFetch);
  run("npx", [
    "--yes",
    "vercel@63.1.2",
    "promote",
    url,
    "--yes",
    "--scope",
    scope,
  ]);
  console.log(
    "Isolated test deployment promoted. Real Google login still requires its separate check.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
