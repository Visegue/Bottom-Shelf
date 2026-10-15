import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { cookies } from "next/headers";
import { AppError, requireEnv } from "@/lib/config";

export function getAuth() {
  return createNeonAuth({
    baseUrl: requireEnv("NEON_AUTH_BASE_URL"),
    cookies: { secret: requireEnv("NEON_AUTH_COOKIE_SECRET") },
    logLevel: "silent",
  });
}
export async function requireOwner() {
  if (!(await cookies()).has("__Secure-neon-auth.session_token"))
    throw new AppError("unauthorized", 401);
  // Ask Managed Auth for a current session rather than trusting a cached user.
  const { data, error } = await getAuth().getSession({
    query: { disableCookieCache: "true" },
  });
  if (error) throw new AppError("unavailable", 503);
  if (!data?.user) throw new AppError("unauthorized", 401);
  const email = requireEnv("OWNER_EMAIL").trim().toLowerCase();
  const userId = requireEnv("OWNER_USER_ID");
  if (
    data.user.id !== userId ||
    data.user.email.toLowerCase() !== email ||
    !data.user.emailVerified
  ) {
    throw new AppError("forbidden", 403);
  }
  return { id: data.user.id, email: data.user.email };
}
