import { pathToFileURL } from "node:url";

export async function smokeDeployment(rawUrl, fetchPage = fetch) {
  const url = new URL(rawUrl);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.vercel\.app$/i.test(url.hostname) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("Expected a plain HTTPS Vercel deployment URL");
  }
  const home = await fetchPage(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  if (
    home.status !== 200 ||
    !home.headers.get("content-type")?.includes("text/html")
  ) {
    throw new Error("Deployment did not return the landing page");
  }
  const html = await home.text();
  if (!html.includes("Bottom Shelf") || !html.includes("Fortsätt med Google")) {
    throw new Error("Deployment landing page is incomplete");
  }
  const denied = await fetchPage(new URL("/api/foundation", url), {
    method: "POST",
    headers: { Origin: url.origin, "Content-Type": "application/json" },
    body: "{}",
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  if (
    denied.status !== 401 ||
    !denied.headers.get("cache-control")?.includes("no-store") ||
    (await denied.json()).error !== "unauthorized"
  ) {
    throw new Error("Anonymous private access was not denied safely");
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await smokeDeployment(process.env.DEPLOYMENT_URL);
    console.log("Landing page and anonymous access protection verified.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
