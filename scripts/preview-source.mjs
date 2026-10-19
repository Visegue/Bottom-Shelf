import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PreviewError } from "./preview-policy.mjs";

export function readApprovedSource(sha, { root = process.cwd() } = {}) {
  if (!/^[a-f0-9]{40}$/.test(sha))
    throw new PreviewError("Invalid source revision");
  // Only this fresh checkout may be uploaded. Candidate's writable Git database is untrusted.
  const source = resolve(root, "source");
  function git(args, encoding = "utf8") {
    const result = spawnSync("git", ["-C", source, ...args], {
      encoding,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0)
      throw new PreviewError("Cannot read pristine approved source");
    return result.stdout;
  }
  if (git(["rev-parse", "HEAD"]).trim() !== sha)
    throw new PreviewError("Pristine source revision differs");
  const files = [];
  for (const entry of git(["ls-tree", "-rz", "--full-tree", sha])
    .split("\0")
    .filter(Boolean)) {
    const tab = entry.indexOf("\t"),
      header = entry.slice(0, tab),
      file = entry.slice(tab + 1);
    if (
      !/^100(644|755) blob /.test(header) ||
      (file.startsWith(".env") && file !== ".env.example")
    )
      throw new PreviewError("Unsupported or private file in approved source");
    const data = git(["show", `${sha}:${file}`], null);
    if (file === "vercel.json") {
      const config = JSON.parse(data);
      if (config.env || config.build?.env)
        throw new PreviewError(
          "Source may not override scoped deployment credentials",
        );
    }
    files.push({ file, data: data.toString("base64"), encoding: "base64" });
  }
  if (JSON.stringify(files).length > 4000000)
    throw new PreviewError("Source exceeds reviewed inline upload capacity");
  return files;
}
