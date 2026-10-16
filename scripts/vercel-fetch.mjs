import { spawnSync } from "node:child_process";

// Use platform authorization for protected staged deployments. App cookies are
// never supplied, so the private-route request still tests an anonymous user.
export async function vercelFetch(input, init = {}) {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.vercel\.app$/i.test(url.hostname)
  )
    throw new Error("Invalid deployment destination");
  const args = [
    "--yes",
    "vercel@63.1.2",
    "curl",
    url.pathname + url.search,
    "--deployment",
    url.origin,
    "--",
    "--silent",
    "--show-error",
    "--include",
    "--max-time",
    "20",
    "--request",
    init.method ?? "GET",
  ];
  for (const [name, value] of new Headers(init.headers))
    args.push("--header", `${name}: ${value}`);
  if (init.body) args.push("--data", init.body);
  const result = spawnSync("npx", args, {
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error("Authenticated Vercel smoke request failed");
  const response = result.stdout;
  const delimiter = response.match(/\r?\n\r?\n/);
  if (!delimiter) throw new Error("Malformed deployment response");
  const head = response.slice(0, delimiter.index).split(/\r?\n/);
  const status = Number(head.shift().match(/^HTTP\/\S+\s+(\d+)/)?.[1]);
  if (!status) throw new Error("Missing deployment HTTP status");
  const headers = new Headers();
  for (const line of head) {
    const colon = line.indexOf(":");
    if (colon > 0)
      headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  return new Response(response.slice(delimiter.index + delimiter[0].length), {
    status,
    headers,
  });
}
