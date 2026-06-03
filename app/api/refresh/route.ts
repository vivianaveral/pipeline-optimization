import { NextResponse } from "next/server";
import {
  fetchDefaultPipelineDeals,
  fetchParkingLotDeals,
  fetchClosedLostDeals,
  fetchPostBillingDeals,
  fetchActiveClientDeals,
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
    console.log("[refresh] ── Starting 5-query fetch ─────────────────────────");

    // ── 1. Default pipeline by createdate ─────────────────────────────────────
    // Handles: calls booked, no-shows, billing, missed zoom, billing breakdowns, cohort
    const defaultDeals = await fetchDefaultPipelineDeals(token);
    console.log(`[refresh] defaultDeals: ${defaultDeals.length}`);

    // ── 2. Parking Lot by stage-entry date (no pipeline/createdate filter) ────
    // FIX 1: Captures pre-2026 deals that entered parking lot in 2026
    const parkingLotDeals = await fetchParkingLotDeals(token);
    console.log(`[refresh] parkingLotDeals: ${parkingLotDeals.length}`);

    // ── 3. Closed Lost by stage-entry date, pipeline=default at API level ─────
    // FIX 3: pipeline filter applied in the HubSpot query, not in-memory
    const closedLostDeals = await fetchClosedLostDeals(token);
    console.log(`[refresh] closedLostDeals: ${closedLostDeals.length}`);

    // ── 4. Post-billing by each stage-entry date (no createdate filter) ───────
    // FIX 4: Captures pre-2026 deals that entered recruiting/etc. in 2026
    const postBillingDeals = await fetchPostBillingDeals(token);
    console.log(`[refresh] postBillingDeals: ${postBillingDeals.length}`);

    // ── 5. Active Client ALL pipelines by stage-entry date ────────────────────
    // FIX 2: Logged at HubSpot level; counted separately from all other metrics
    const acDeals = await fetchActiveClientDeals(token);
    console.log(`[refresh] acDeals: ${acDeals.length}`);

    // ── wonPool: merges defaultDeals + postBillingDeals for Closed Won count ──
    // Pre-2026 deals in postBillingDeals are added; existing IDs from defaultDeals win
    const wonPool = mergeDeals(defaultDeals, postBillingDeals);
    console.log(`[refresh] wonPool (default + post-billing): ${wonPool.length}`);

    // ── Compute monthly metrics using dedicated per-metric deal sets ──────────
    const byMonth = computeAllMonths(
      defaultDeals, parkingLotDeals, closedLostDeals, postBillingDeals, acDeals, wonPool
    );

    // ── Initiatives use defaultDeals (sales funnel only) ─────────────────────
    const initiatives = computeInitiatives(defaultDeals);

    // ── All deals for cache storage ───────────────────────────────────────────
    const allDeals = mergeDeals(defaultDeals, parkingLotDeals, closedLostDeals, postBillingDeals, acDeals);
    console.log(`[refresh] allDeals (merged for cache): ${allDeals.length}`);

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

    // ── Validation ─────────────────────────────────────────────────────────────
    const may = byMonth["2026-05"];
    if (may) {
      console.log("[refresh] ── MAY 2026 VALIDATION ──────────────────────────");
      console.log(`Calls booked:    ${may.callsBooked}   (target ~1,881)`);
      console.log(`No-shows:        ${may.noShows}   (target ~722)`);
      console.log(`Attended:        ${may.attended}   (target ~1,159)`);
      console.log(`Billing entered: ${may.billingEntered}   (target ~766)`);
      console.log(`Parking Lot:     ${may.parkingLot}   (target ~49)`);
      console.log(`Drop-offs:       ${may.dropOffs}   (target ~344)`);
      console.log(`Drop rate:       ${may.dropRate}%   (target ~29.7%)`);
      console.log(`Closed Won:      ${may.closedWon}   (target ~489)`);
      console.log(`Active Client:   ${may.activeClient}   (target ~180)`);
      console.log(`Closed Lost:     ${may.closedLost}   (target ~2,171)`);
      console.log("[refresh] ────────────────────────────────────────────────");
    }

    return NextResponse.json({
      success: true,
      timestamp: cache.lastRefreshed,
      counts: {
        defaultDeals: defaultDeals.length,
        parkingLotDeals: parkingLotDeals.length,
        closedLostDeals: closedLostDeals.length,
        postBillingDeals: postBillingDeals.length,
        acDeals: acDeals.length,
        wonPool: wonPool.length,
        allDeals: allDeals.length,
      },
      validation: may ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[refresh] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
