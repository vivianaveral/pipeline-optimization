import { NextResponse } from "next/server";
import { fetchDefaultPipelineDeals, fetchActiveClientDeals, mergeDeals } from "@/lib/hubspot";
import { computeAllMonths, computeInitiatives } from "@/lib/metrics";
import { writeCache } from "@/lib/cache";
import type { CacheData } from "@/lib/types";

export const maxDuration = 300; // Railway Pro supports up to 300s

export async function POST() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HUBSPOT_ACCESS_TOKEN not set" }, { status: 500 });
  }

  try {
    console.log("[refresh] Starting HubSpot fetch...");

    // 1. Fetch default pipeline deals (createdate >= 2026-01-01, by month)
    const defaultDeals = await fetchDefaultPipelineDeals(token);
    console.log(`[refresh] Default pipeline: ${defaultDeals.length} deals`);

    // 2. Fetch active client deals across all pipelines
    const activeClientDeals = await fetchActiveClientDeals(token);
    console.log(`[refresh] Active client (all pipelines): ${activeClientDeals.length} deals`);

    // 3. Merge (dedupe by deal ID, default pipeline data takes precedence)
    const allDeals = mergeDeals(defaultDeals, activeClientDeals);
    console.log(`[refresh] Merged: ${allDeals.length} total unique deals`);

    // 4. Compute monthly metrics for all months Jan 2026 – current
    const byMonth = computeAllMonths(allDeals);

    // 5. Compute initiative snapshots
    const initiatives = computeInitiatives(allDeals);

    const cache: CacheData = {
      lastRefreshed: new Date().toISOString(),
      dealCount: allDeals.length,
      defaultPipelineDealCount: defaultDeals.length,
      activeClientDealCount: activeClientDeals.length,
      deals: allDeals,
      computed: { byMonth },
      initiatives,
    };

    writeCache(cache);

    // Log May 2026 validation numbers
    const may = byMonth["2026-05"];
    if (may) {
      console.log("=== MAY 2026 VALIDATION ===");
      console.log(`Calls booked:   ${may.callsBooked}  (target ~1,881)`);
      console.log(`No-shows:       ${may.noShows}  (target ~722)`);
      console.log(`Attended:       ${may.attended}  (target ~1,159)`);
      console.log(`Billing entered:${may.billingEntered}  (target ~766)`);
      console.log(`Parking Lot:    ${may.parkingLot}  (target ~266)`);
      console.log(`Drop-offs:      ${may.dropOffs}  (target ~127)`);
      console.log(`Drop rate:      ${may.dropRate}%  (target ~11.0%)`);
      console.log(`Closed Won:     ${may.closedWon}  (target ~489)`);
      console.log(`Active Client:  ${may.activeClient}  (target ~194)`);
      console.log(`Closed Lost:    ${may.closedLost}  (target ~2,173)`);
      console.log("===========================");
    }

    return NextResponse.json({
      success: true,
      timestamp: cache.lastRefreshed,
      dealCount: allDeals.length,
      defaultPipelineDealCount: defaultDeals.length,
      activeClientDealCount: activeClientDeals.length,
      validation: may ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[refresh] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
