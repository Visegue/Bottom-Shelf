import assert from "node:assert/strict";
import test from "node:test";
import { promoteDeployment } from "../../scripts/promote-deployment.mjs";

const context = {
  projectId: "prj_test",
  orgId: "team_test",
  token: "private-promotion-fixture",
};
const url = "https://bottom-shelf-fixture.vercel.app";
const deployment = {
  id: "dpl_fixture",
  projectId: context.projectId,
  ownerId: context.orgId,
  target: "production",
  readyState: "READY",
};

test("promotion verifies the staged project and confirms its production target without a user lookup", async () => {
  const calls = [];
  await promoteDeployment(url, context, async (input, init) => {
    const endpoint = new URL(input);
    calls.push({ path: endpoint.pathname, method: init.method ?? "GET" });
    assert.equal(endpoint.origin, "https://api.vercel.com");
    assert.equal(endpoint.searchParams.get("teamId"), context.orgId);
    assert.equal(init.headers.Authorization, `Bearer ${context.token}`);
    if (calls.length === 1) return Response.json(deployment);
    if (calls.length === 2) return new Response(null, { status: 201 });
    return Response.json({ targets: { production: { id: deployment.id } } });
  });
  assert.deepEqual(calls, [
    { path: "/v13/deployments/bottom-shelf-fixture.vercel.app", method: "GET" },
    { path: "/v10/projects/prj_test/promote/dpl_fixture", method: "POST" },
    { path: "/v9/projects/prj_test", method: "GET" },
  ]);
});

test("an accepted promotion waits until the project points to the staged deployment", async () => {
  let confirmations = 0;
  await promoteDeployment(url, context, async (input, init) => {
    if (new URL(input).pathname.startsWith("/v13/"))
      return Response.json(deployment);
    if (init.method === "POST") return new Response(null, { status: 202 });
    confirmations++;
    return Response.json({
      targets: {
        production: { id: confirmations === 1 ? "dpl_old" : deployment.id },
      },
    });
  });
  assert.equal(confirmations, 2);
});

test("rejected promotion fails without printing the provider response body", async () => {
  await assert.rejects(
    () =>
      promoteDeployment(url, context, async (input, init) =>
        init.method === "POST"
          ? new Response(context.token, { status: 403 })
          : Response.json(deployment),
      ),
    (error) =>
      /403/.test(error.message) && !error.message.includes(context.token),
  );
});

for (const mismatch of [
  { projectId: "prj_other" },
  { ownerId: "team_other" },
  { target: "preview" },
  { readyState: "BUILDING" },
]) {
  test(`promotion refuses mismatched deployment metadata ${JSON.stringify(mismatch)}`, async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        promoteDeployment(url, context, async () => {
          calls++;
          return Response.json({ ...deployment, ...mismatch });
        }),
      /Unexpected staged deployment/,
    );
    assert.equal(calls, 1);
  });
}
