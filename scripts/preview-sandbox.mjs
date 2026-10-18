import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Official Playwright 1.64.0 image, Node 24, pinned multi-platform manifest.
const image =
  "mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f";
export function previewSandbox(
  mode,
  { root = process.cwd(), env = process.env } = {},
) {
  if (!["quality", "migrations"].includes(mode))
    throw new Error("Unknown preview execution mode");
  const args = [
    "run",
    "--rm",
    "--init",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "512",
    "--memory",
    "6g",
    "--cpus",
    "2",
    "--shm-size",
    "1g",
    "--user",
    `${process.getuid()}:${process.getgid()}`,
    "--env",
    "CI=true",
    "--env",
    "HOME=/tmp/preview-home",
    "--env",
    "RUNNER_TEMP=/tmp",
    "--workdir",
    mode === "quality" ? "/work/candidate" : "/work",
  ];
  const clientEnv = { PATH: env.PATH, HOME: env.HOME };
  const mount = (name, readonly = false) =>
    args.push(
      "--mount",
      `type=bind,src=${resolve(root, name)},dst=/work/${name}${readonly ? ",readonly" : ""}`,
    );
  mount("candidate");
  if (mode === "migrations") {
    if (!env.PREVIEW_INPUT) throw new Error("Scoped preview input required");
    mount("baseline");
    mount("control", true);
    clientEnv.PREVIEW_INPUT = env.PREVIEW_INPUT;
    args.push("--env", "PREVIEW_INPUT");
  }
  // No host PID namespace, runner home/temp, environment files, credentials or
  // Docker socket enter the container. Only scoped input is explicitly exported.
  args.push(
    image,
    ...(mode === "quality"
      ? ["bash", "-euc", "npm ci; npm run check; npm test"]
      : ["node", "/work/control/scripts/preview-execute.mjs"]),
  );
  return spawnSync("docker", args, {
    env: clientEnv,
    encoding: "utf8",
    timeout: 25 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const mode = process.argv[2];
    const result = previewSandbox(mode);
    if (mode === "quality") {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    if (result.error || result.status !== 0)
      throw new Error("Preview sandbox failed");
    console.log("Isolated preview execution passed.");
  } catch {
    console.error(
      "Preview sandbox stopped; scoped execution output is withheld.",
    );
    process.exitCode = 1;
  }
}
