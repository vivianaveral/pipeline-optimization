import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

const COOKIE_NAME = "bw_auth";

/** Compute hex SHA-256 of a string using the Web Crypto API (Edge-compatible). */
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the login page and its API through
  if (pathname === "/login" || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    // Misconfigured — let the request through rather than lock everyone out
    console.error("[auth] DASHBOARD_PASSWORD env var is not set");
    return NextResponse.next();
  }

  const expected = await sha256Hex(password);
  const cookie   = request.cookies.get(COOKIE_NAME)?.value;

  if (cookie === expected) {
    return NextResponse.next();
  }

  // Not authenticated — redirect to login, preserving the intended destination
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search   = "";
  return NextResponse.redirect(loginUrl);
}
