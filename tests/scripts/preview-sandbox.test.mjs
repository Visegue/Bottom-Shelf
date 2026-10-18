import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewSandbox } from "../../scripts/preview-sandbox.mjs";

test("PR execution cannot inherit the host runner's cache or repository credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "bs-preview-sandbox-"));
  try {
    await mkdir(join(root, "bin"));
    await mkdir(join(root, "candidate"));
    for (const name of ["npm", "docker"])
      await writeFile(
        join(root, "bin", name),
        `#!${process.execPath}\nconsole.log(JSON.stringify({token: process.env.ACTIONS_RUNTIME_TOKEN, url: process.env.ACTIONS_CACHE_URL, management: process.env.GH_TOKEN, input: process.env.PREVIEW_INPUT, args: process.argv.slice(2)}));\n`,
        { mode: 0o755 },
      );
    const env = {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      ACTIONS_RUNTIME_TOKEN: "host-cache-token",
      ACTIONS_CACHE_URL: "https://host-cache.test",
      GH_TOKEN: "host-management-token",
      PREVIEW_INPUT: "private-scoped-input",
    };
    const result = previewSandbox("quality", { root, env });
    assert.equal(result.status, 0, result.stderr);
    const actual = JSON.parse(result.stdout);
    assert.equal(
      actual.token,
      undefined,
      "host cache token must be inaccessible to the execution process",
    );
    assert.equal(actual.url, undefined);
    assert.equal(actual.management, undefined);
    assert.equal(
      actual.input,
      undefined,
      "quality needs no scoped private input",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
