import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";

export default function proxy(request: NextRequest) {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return getAuth().middleware({ loginUrl: "/" })(request);
}
export const config = { matcher: ["/check/:path*"] };
