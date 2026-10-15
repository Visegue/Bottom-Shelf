import "server-only";

export class AppError extends Error {
  constructor(
    public code:
      | "unauthorized"
      | "forbidden"
      | "configuration"
      | "unavailable"
      | "cleanup"
      | "request",
    public status: number,
  ) {
    super(code);
  }
}
export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new AppError("configuration", 503);
  return value;
}
export function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
