import { NextResponse } from "next/server";
import { readCache } from "@/lib/cache";

export async function GET() {
  const cache = readCache();
  if (!cache) {
    return NextResponse.json({ error: "No data yet. Click Refresh to load from HubSpot." }, { status: 404 });
  }
  return NextResponse.json(cache);
}
