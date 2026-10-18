import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { smokeDeployment } from "./smoke-deployment.mjs";
import { vercelFetch } from "./vercel-fetch.mjs";
import { promoteDeployment } from "./promote-deployment.mjs";

const expectedProject = "prj_9mmJV4XIqdZyvhtpwh2amkiQS2k6";
const expectedOrg = "team_J9VXW7YbzLRuOTDPUyQTpEUP";
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
  if (link.projectId !== expectedProject || link.orgId !== expectedOrg)
    throw new Error("Unexpected local Vercel project");
}
if (process.env.VERCEL_ORG_ID && process.env.VERCEL_ORG_ID !== expectedOrg)
  throw new Error("Unexpected Vercel organization");
function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error || result.status !== 0) {
    let details = [result.error?.message, result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n");
    const secrets = Object.entries(process.env)
      .filter(
        ([name, value]) =>
          /TOKEN|SECRET|PASSWORD|DATABASE.*URL|ACCESS_KEY|AUTH_STATE/i.test(
            name,
          ) && value,
      )
      .map(([, value]) => value)
      .sort((a, b) => b.length - a.length);
    for (const secret of secrets)
      details = details.replaceAll(secret, "<REDACTED>");
    details = details
      .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "<REDACTED_DATABASE_URL>")
      .replace(/\b(?:vcp_|re_|GOCSPX-)[A-Za-z0-9_-]+/g, "<REDACTED>")
      .slice(-6000);
    throw new Error(
      `${command} failed (${result.signal ?? result.status ?? "could not start"}):\n${details}`,
    );
  }
  return result.stdout?.trim();
}
try {
  // Vercel rebuilds from source with the test environment; never deploy build:check output.
  // Use the linked project or explicit IDs. --scope requires a user-profile
  // lookup that the CI token cannot perform in a clean CLI configuration.
  const output = run(
    "npx",
    [
      "--yes",
      "vercel@63.1.2",
      "deploy",
      "--prod",
      "--skip-domain",
      "--yes",
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
  if (process.env.VERCEL_TOKEN) {
    await promoteDeployment(url, {
      projectId: expectedProject,
      orgId: expectedOrg,
      token: process.env.VERCEL_TOKEN,
    });
  } else {
    run("npx", ["--yes", "vercel@63.1.2", "promote", url, "--yes"]);
  }
  console.log(
    "Isolated test deployment promoted. Real Google login still requires its separate check.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
