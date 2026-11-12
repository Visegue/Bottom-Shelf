import "./compatibility-loader.mjs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

// No outbound provider access in this synthetic compatibility test process.
globalThis.fetch = async (url) => {
  assert.equal(new URL(url).origin, process.env.AWS_ENDPOINT_URL_S3);
  return new Response("Private fixture storage", { status: 403 });
};
const { checkFoundation } = await import(pathToFileURL(process.argv[2]).href);
assert.deepEqual(await checkFoundation("compatibility-owner"), {
  ok: true,
  database: "verified",
  privateImage: "verified",
  cleanup: "verified",
});
console.log("Actual application SQL probe and cleanup passed.");
