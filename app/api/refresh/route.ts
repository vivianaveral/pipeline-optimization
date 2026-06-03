import { NextResponse } from "next/server";
import {
  fetchCallsBookedCounts,
  fetchNoShowCounts,
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
    console.log("[refresh] ── Starting fetch ──────────────────────────────────");

    // ── Calls Booked — getCallsBooked() per month, response.total ─────────────
    const callsBookedCounts = await fetchCallsBookedCounts(token);
    console.log(`[refresh] callsBookedCounts: ${JSON.stringify(callsBookedCounts)}`);

    // ── No-shows — getNoShows() per month, response.total ─────────────────────
    const noShowCounts = await fetchNoShowCounts(token);
    console.log(`[refresh] noShowCounts: ${JSON.stringify(noShowCounts)}`);

    // ── Default pipeline by createdate — billing, sub-stages, cohort ─────────
    const defaultDeals = await fetchDefaultPipelineDeals(token);
    console.log(`[refresh] defaultDeals: ${defaultDeals.length}`);

    // ── Parking Lot by stage-entry date ───────────────────────────────────────
    const parkingLotDeals = await fetchParkingLotDeals(token);
    console.log(`[refresh] parkingLotDeals: ${parkingLotDeals.length}`);

    // ── Closed Lost — CL stage date, pipeline=default, HAS_PROPERTY appt ─────
    const closedLostDeals = await fetchClosedLostDeals(token);
    console.log(`[refresh] closedLostDeals: ${closedLostDeals.length}`);

    // ── Closed Won — getClosedWon() per month, response.total ─────────────────
    const closedWonCounts = await fetchClosedWonCounts(token);
    console.log(`[refresh] closedWonCounts: ${JSON.stringify(closedWonCounts)}`);

    // ── Active Client — AC stage date, all pipelines, HAS_PROPERTY appt ──────
    const acDeals = await fetchActiveClientDeals(token);
    console.log(`[refresh] acDeals: ${acDeals.length}`);

    // ── Compute monthly metrics ───────────────────────────────────────────────
    const byMonth = computeAllMonths(
      defaultDeals, callsBookedCounts, noShowCounts,
      parkingLotDeals, closedLostDeals, closedWonCounts, acDeals
    );

    // ── Initiatives use defaultDeals (sales funnel only) ─────────────────────
    const initiatives = computeInitiatives(defaultDeals);

    // ── All deals for cache storage ───────────────────────────────────────────
    const allDeals = mergeDeals(defaultDeals, parkingLotDeals, closedLostDeals, acDeals);
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
        callsBookedMay: callsBookedCounts["2026-05"] ?? 0,
        noShowsMay: noShowCounts["2026-05"] ?? 0,
        closedWonMay: closedWonCounts["2026-05"] ?? 0,
        defaultDeals: defaultDeals.length,
        parkingLotDeals: parkingLotDeals.length,
        closedLostDeals: closedLostDeals.length,
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
