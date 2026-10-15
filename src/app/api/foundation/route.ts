import { requireOwner } from "@/lib/auth/server";
import { AppError, privateJson } from "@/lib/config";
import { checkFoundation } from "@/lib/foundation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new AppError("request", 403);
    return privateJson(await checkFoundation(owner.id));
  } catch (e) {
    return privateJson(
      { error: e instanceof AppError ? e.code : "unavailable" },
      e instanceof AppError ? e.status : 502,
    );
  }
}
