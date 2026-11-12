import { test } from "node:test";
import assert from "node:assert/strict";
import { deployPreview } from "../../scripts/deploy-preview.mjs";
import {
  vercelProject,
  vercelTeam,
  previewAlias,
} from "../../scripts/preview-policy.mjs";

const request = {
  pr: 36,
  branch: "acceptance",
  sha: "a".repeat(40),
  files: [],
  runtime: {},
};
function fixture({
  quota,
  failBuild = false,
  failAliasSmoke = false,
  previous = true,
  failRecovery = false,
  otherMoves = false,
  incompleteDomains = false,
} = {}) {
  const alias = previewAlias(request.pr);
  let deployment = previous ? "dpl_previous" : null;
  let otherDeployment = "dpl_other";
  const writes = [];
  return {
    writes,
    options: {
      token: "fixture",
      pause: async () => {},
      fetchApi: async (url, init) => {
        const path = url.pathname;
        if (path === `/v9/projects/${vercelProject}`)
          return Response.json({
            id: vercelProject,
            accountId: vercelTeam,
            name: "bottom-shelf",
          });
        if (path.endsWith("/env")) return Response.json({ envs: [] });
        if (path === `/v9/projects/${vercelProject}/domains`)
          return Response.json({
            domains: [{ name: previewAlias(37) }],
            pagination: { next: incompleteDomains ? 123 : null },
          });
        if (path.includes("/domains/"))
          return Response.json({
            projectId: vercelProject,
            gitBranch: "acceptance",
            verified: true,
          });
        if (path === "/v13/deployments") {
          if (quota)
            return new Response("private provider message", { status: quota });
          writes.push("create");
          return Response.json({
            id: "dpl_new",
            projectId: vercelProject,
            url: "fixture.vercel.app",
          });
        }
        if (path === "/v13/deployments/dpl_new")
          return Response.json({
            projectId: vercelProject,
            readyState: failBuild ? "ERROR" : "READY",
            meta: { approvedSHA: request.sha, previewPR: "36" },
          });
        if (path === `/v4/aliases/${alias}`)
          return deployment
            ? Response.json({
                projectId: vercelProject,
                deploymentId: deployment,
              })
            : new Response("missing", { status: 404 });
        if (path === `/v4/aliases/${previewAlias(37)}`)
          return Response.json({
            projectId: vercelProject,
            deploymentId: otherDeployment,
          });
        if (path.endsWith("/aliases")) {
          assert.equal(JSON.parse(init.body).alias, alias);
          const id = path.split("/")[3];
          if (id === "dpl_previous" && failRecovery)
            return new Response("private", { status: 503 });
          deployment = id;
          if (otherMoves && id === "dpl_new") otherDeployment = "dpl_changed";
          writes.push(id);
          return Response.json({ alias });
        }
        if (path === `/v2/aliases/${alias}` && init.method === "DELETE") {
          deployment = null;
          writes.push("delete-own-alias");
          return new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected API: ${path}`);
      },
      fetchPage: async (url) => {
        if (failAliasSmoke && url.hostname === alias)
          return new Response("unavailable", { status: 503 });
        return url.pathname === "/"
          ? new Response("Bottom Shelf Fortsätt med Google", {
              headers: { "content-type": "text/html" },
            })
          : Response.json(
              { error: "unauthorized" },
              { status: 401, headers: { "cache-control": "no-store" } },
            );
      },
    },
  };
}

test("provider quota/payment failures stop without replacing aliases, resets or upgrades", async () => {
  for (const quota of [402, 429]) {
    const { writes, options } = fixture({ quota });
    await assert.rejects(
      deployPreview(request, options),
      new RegExp(String(quota)),
    );
    assert.deepEqual(writes, []);
  }
  const { writes, options } = fixture({ failBuild: true });
  await assert.rejects(deployPreview(request, options), /build failed/);
  assert.deepEqual(writes, ["create"]);
});

test("failure after alias publication restores the previous deployment without reversing migrations", async () => {
  const { writes, options } = fixture({ failAliasSmoke: true });
  await assert.rejects(deployPreview(request, options), /landing page/);
  assert.deepEqual(writes, ["create", "dpl_new", "dpl_previous"]);
});

test("failed first publication removes only its own new alias and reports failed recovery explicitly", async () => {
  const first = fixture({ failAliasSmoke: true, previous: false });
  await assert.rejects(deployPreview(request, first.options), /landing page/);
  assert.deepEqual(first.writes, ["create", "dpl_new", "delete-own-alias"]);
  const failed = fixture({ failAliasSmoke: true, failRecovery: true });
  await assert.rejects(
    deployPreview(request, failed.options),
    /recovery could not be verified/,
  );
});

test("publication audits other PR deployment IDs and recovers its own alias if another changes", async () => {
  const incomplete = fixture({ incompleteDomains: true });
  await assert.rejects(
    deployPreview(request, incomplete.options),
    /audit all PR aliases/,
  );
  assert.deepEqual(incomplete.writes, []);
  const stable = fixture();
  assert.match(
    await deployPreview(request, stable.options),
    /bottom-shelf-pr-36/,
  );
  assert.deepEqual(stable.writes, ["create", "dpl_new"]);
  const changed = fixture({ otherMoves: true });
  await assert.rejects(
    deployPreview(request, changed.options),
    /Another PR alias changed/,
  );
  assert.deepEqual(changed.writes, ["create", "dpl_new", "dpl_previous"]);
});
