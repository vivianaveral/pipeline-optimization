import { NextResponse } from "next/server";
import {
  fetchCallsBookedDeals,
  fetchNoShowDeals,
  fetchDefaultPipelineDeals,
  fetchParkingLotDeals,
  fetchClosedLostDeals,
  fetchClosedWonCounts,
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
    console.log("[refresh] ── Starting 7-query fetch ─────────────────────────");

    // ── 1a. Calls Booked — Query 1: zoom stage date, pipeline=default, HAS_PROPERTY appt
    const callsBookedDeals = await fetchCallsBookedDeals(token);
    console.log(`[refresh] callsBookedDeals: ${callsBookedDeals.length}`);

    // ── 1b. No-shows — Query 2: missed zoom stage date, pipeline=default, HAS_PROPERTY appt
    const noShowDeals = await fetchNoShowDeals(token);
    console.log(`[refresh] noShowDeals: ${noShowDeals.length}`);

    // ── 2. Default pipeline by createdate — billing, sub-stages, cohort ───────
    const defaultDeals = await fetchDefaultPipelineDeals(token);
    console.log(`[refresh] defaultDeals: ${defaultDeals.length}`);

    // ── 3. Parking Lot by stage-entry date (no pipeline filter) ───────────────
    const parkingLotDeals = await fetchParkingLotDeals(token);
    console.log(`[refresh] parkingLotDeals: ${parkingLotDeals.length}`);

    // ── 4. Closed Lost — CL stage date, pipeline=default, HAS_PROPERTY appt ──
    const closedLostDeals = await fetchClosedLostDeals(token);
    console.log(`[refresh] closedLostDeals: ${closedLostDeals.length}`);

    // ── 5. Closed Won — Query 3: response.total per month (12 filters, under 18 limit)
    const closedWonCounts = await fetchClosedWonCounts(token);
    console.log(`[refresh] closedWonCounts months: ${Object.keys(closedWonCounts).length}`);

    // ── 6. Active Client — AC stage date, all pipelines, HAS_PROPERTY appt ───
    const acDeals = await fetchActiveClientDeals(token);
    console.log(`[refresh] acDeals: ${acDeals.length}`);

    // ── Compute monthly metrics using exact per-metric deal sets ──────────────
    const byMonth = computeAllMonths(
      defaultDeals, callsBookedDeals, noShowDeals,
      parkingLotDeals, closedLostDeals, closedWonCounts, acDeals
    );

    // ── Initiatives use defaultDeals (sales funnel only) ─────────────────────
    const initiatives = computeInitiatives(defaultDeals);

    // ── All deals for cache storage ───────────────────────────────────────────
    const allDeals = mergeDeals(
      callsBookedDeals, noShowDeals, defaultDeals,
      parkingLotDeals, closedLostDeals, acDeals
    );
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
      console.log(`Calls booked:    ${may.callsBooked}   (target ~1,875)`);
      console.log(`No-shows:        ${may.noShows}   (target ~701)`);
      console.log(`Attended:        ${may.attended}   (target ~1,174)`);
      console.log(`Billing entered: ${may.billingEntered}   (target ~798)`);
      console.log(`Parking Lot:     ${may.parkingLot}   (target ~49)`);
      console.log(`Drop-offs:       ${may.dropOffs}   (target ~327)`);
      console.log(`Drop rate:       ${may.dropRate}%   (target ~27.9%)`);
      console.log(`Closed Won:      ${may.closedWon}   (target ~481)`);
      console.log(`Active Client:   ${may.activeClient}   (target ~181)`);
      console.log(`Closed Lost:     ${may.closedLost}   (target ~2,202)`);
      console.log("[refresh] ────────────────────────────────────────────────");
    }

    return NextResponse.json({
      success: true,
      timestamp: cache.lastRefreshed,
      counts: {
        callsBookedDeals: callsBookedDeals.length,
        noShowDeals: noShowDeals.length,
        defaultDeals: defaultDeals.length,
        parkingLotDeals: parkingLotDeals.length,
        closedLostDeals: closedLostDeals.length,
        closedWonMay: closedWonCounts["2026-05"] ?? 0,
        acDeals: acDeals.length,
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
