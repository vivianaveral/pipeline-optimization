import { NextResponse } from "next/server";
import { readCache } from "@/lib/cache";

export async function GET() {
  const cache = readCache();
  if (!cache) {
    return NextResponse.json({ error: "No data — click Refresh to load from HubSpot." }, { status: 404 });
  }
  // Return everything except the raw deals array (too large for the API response)
  const { deals: _deals, ...rest } = cache;
  return NextResponse.json(rest);
}
