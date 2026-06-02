import { NextResponse } from "next/server";
import {
  fetchDefaultPipelineDeals,
  fetchActiveClientDeals,
  fetchParkingLotDeals,
  fetchPostBillingDeals,
  mergeDeals,
} from "@/lib/hubspot";
import { computeAllMonths, computeInitiatives } from "@/lib/metrics";
import { writeCache } from "@/lib/cache";
import type { CacheData } from "@/lib/types";

export const maxDuration = 300;

export async function POST() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HUBSPOT_ACCESS_TOKEN not set" }, { status: 500 });
  }

  try {
    console.log("[refresh] Starting HubSpot fetch...");

    // ── Four targeted fetches ──────────────────────────────────────────────────
    // 1. Default pipeline by createdate (main set)
    const defaultDeals = await fetchDefaultPipelineDeals(token);
    console.log(`[refresh] Default pipeline (createdate): ${defaultDeals.length}`);

    // 2. Active client — ALL pipelines by AC stage date
    //    Kept separate; used ONLY for active client metric to avoid CL inflation.
    const acDeals = await fetchActiveClientDeals(token);
    console.log(`[refresh] Active client (all pipelines): ${acDeals.length}`);

    // 3. Parking Lot — default pipeline by stage-entry date
    //    Captures pre-2026 deals that got parked in 2026 (explains 49 → 266 gap).
    const parkingLotDeals = await fetchParkingLotDeals(token);
    console.log(`[refresh] Parking Lot (by stage date): ${parkingLotDeals.length}`);

    // 4. Post-billing — default pipeline by any post-billing stage date
    //    Captures pre-2026 deals that advanced to recruiting/etc. in 2026.
    const postBillingDeals = await fetchPostBillingDeals(token);
    console.log(`[refresh] Post-billing (by stage date): ${postBillingDeals.length}`);

    // salesDeals = all default-pipeline deals we need, merged and deduplicated.
    // Used for every metric EXCEPT active client.
    const salesDeals = mergeDeals(defaultDeals, parkingLotDeals, postBillingDeals);
    console.log(`[refresh] salesDeals (merged): ${salesDeals.length}`);

    // ── Compute metrics ────────────────────────────────────────────────────────
    const byMonth = computeAllMonths(salesDeals, acDeals);
    const initiatives = computeInitiatives(salesDeals);

    // ── Write cache ────────────────────────────────────────────────────────────
    const allDeals = mergeDeals(salesDeals, acDeals);

    const cache: CacheData = {
      lastRefreshed: new Date().toISOString(),
      dealCount: allDeals.length,
      defaultPipelineDealCount: defaultDeals.length,
      activeClientDealCount: acDeals.length,
      deals: allDeals,
      computed: { byMonth },
      initiatives,
    };

    writeCache(cache);

    // ── Validation log ─────────────────────────────────────────────────────────
    const may = byMonth["2026-05"];
    if (may) {
      console.log("=== MAY 2026 VALIDATION ===");
      console.log(`Calls booked:    ${may.callsBooked}  (target ~1,881)`);
      console.log(`No-shows:        ${may.noShows}  (target ~722)`);
      console.log(`Attended:        ${may.attended}  (target ~1,159)`);
      console.log(`Billing entered: ${may.billingEntered}  (target ~766)`);
      console.log(`Parking Lot:     ${may.parkingLot}  (target ~266)`);
      console.log(`Drop-offs:       ${may.dropOffs}  (target ~127)`);
      console.log(`Drop rate:       ${may.dropRate}%  (target ~11.0%)`);
      console.log(`Closed Won:      ${may.closedWon}  (target ~489)`);
      console.log(`Active Client:   ${may.activeClient}  (target ~194)`);
      console.log(`Closed Lost:     ${may.closedLost}  (target ~2,173)`);
      console.log("===========================");
    }

    return NextResponse.json({
      success: true,
      timestamp: cache.lastRefreshed,
      dealCount: allDeals.length,
      defaultPipelineDealCount: defaultDeals.length,
      activeClientDealCount: acDeals.length,
      parkingLotDealCount: parkingLotDeals.length,
      postBillingDealCount: postBillingDeals.length,
      salesDealCount: salesDeals.length,
      validation: may ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[refresh] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
