import assert from "node:assert/strict";
import test from "node:test";
import { smokeDeployment } from "../../scripts/smoke-deployment.mjs";

const url = "https://bottom-shelf-fixture.vercel.app";
const home = () =>
  new Response("<html>Bottom Shelf Fortsätt med Google</html>", {
    headers: { "Content-Type": "text/html" },
  });
const deny = () =>
  Response.json(
    { error: "unauthorized" },
    { status: 401, headers: { "Cache-Control": "private, no-store" } },
  );
test("smoke test accepts a rendered landing page with denied anonymous access", async () => {
  await smokeDeployment(url, async (input) =>
    new URL(input).pathname === "/" ? home() : deny(),
  );
});
test("a login redirect from deployment protection does not count as a passed smoke test", async () => {
  await assert.rejects(
    () => smokeDeployment(url, async () => new Response(null, { status: 302 })),
    /landing page/,
  );
});
test("publicly accessible private routes fail the smoke test", async () => {
  await assert.rejects(
    () =>
      smokeDeployment(url, async (input) =>
        new URL(input).pathname === "/" ? home() : Response.json({ ok: true }),
      ),
    /private access/,
  );
});
test("smoke test rejects destinations outside Vercel before any network call", async () => {
  await assert.rejects(
    () =>
      smokeDeployment("https://example.com", () => {
        throw new Error("should not fetch");
      }),
    /Vercel/,
  );
});
