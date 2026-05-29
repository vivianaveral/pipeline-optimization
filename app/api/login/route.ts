import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "bw_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/** Compute hex SHA-256 of a string (Node crypto, available in API routes). */
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  const envPassword = process.env.DASHBOARD_PASSWORD;
  if (!envPassword) {
    return NextResponse.json({ error: "Server misconfiguration — contact admin." }, { status: 500 });
  }

  let body: { password?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  if (!body.password || body.password !== envPassword) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  // Correct password — compute token and set HTTP-only cookie
  const token = await sha256Hex(envPassword);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
