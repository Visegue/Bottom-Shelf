import { getAuth } from "@/lib/auth/server";
import { AppError, privateJson, requireEnv } from "@/lib/config";

type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  const path = (await context.params).path.join("/");
  // Only the Google flow, session restoration and sign-out are exposed by this app.
  const allowed =
    request.method === "GET"
      ? path === "get-session"
      : request.method === "POST" &&
        (path === "sign-in/social" || path === "sign-out");
  if (!allowed) return privateJson({ error: "forbidden" }, 403);
  if (request.method === "POST") {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return privateJson({ error: "request" }, 403);
    if (path === "sign-in/social") {
      let body;
      try {
        body = await request.clone().json();
      } catch {
        return privateJson({ error: "request" }, 400);
      }
      if (body.provider !== "google")
        return privateJson({ error: "forbidden" }, 403);
      if (body.callbackURL !== `${new URL(request.url).origin}/check`)
        return privateJson({ error: "request" }, 400);
    }
  }
  try {
    if (path === "sign-in/social") requireEnv("OWNER_EMAIL");
    const handlers = getAuth().handler();
    const res = await handlers[request.method as "GET" | "POST"](
      request,
      context,
    );
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("Vary", "Cookie");
    return res;
  } catch (e) {
    return privateJson(
      { error: e instanceof AppError ? e.code : "unavailable" },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
