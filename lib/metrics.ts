import type { Deal, MonthlyMetrics, CohortMetrics, InitiativeSnapshot } from "./types";
import { STAGE_IDS } from "./stages";
import { monthsSince } from "./hubspot";

// ── Date helpers ───────────────────────────────────────────────────────────────

/**
 * True when a HubSpot date string falls in the given month.
 * Uses string prefix — "2026-05-15T...".startsWith("2026-05") — to avoid
 * any timestamp / timezone edge-case.
 */
function inMonth(dateStr: string | null | undefined, monthKey: string): boolean {
  return !!dateStr && dateStr.startsWith(monthKey);
}

function ts(val: string | null | undefined): number | null {
  if (!val) return null;
  const t = new Date(val).getTime();
  return isNaN(t) ? null : t;
}

// ── Business logic ─────────────────────────────────────────────────────────────

function isValidLead(deal: Deal): boolean {
  return !!(
    deal.properties.hs_v2_date_entered_appointmentscheduled ||
    deal.properties[`hs_v2_date_entered_${STAGE_IDS.ENROLLED_IN_SEQ}`] ||
    deal.properties[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]
  );
}

/** Earliest post-billing stage timestamp, or null if none. */
function earliestPostBillingTs(deal: Deal): number | null {
  if (!isValidLead(deal)) return null;
  const candidates = [
    ts(deal.properties[`hs_v2_date_entered_${STAGE_IDS.RECRUITING}`]),
    ts(deal.properties[`hs_v2_date_entered_${STAGE_IDS.RESUMES_SENT}`]),
    ts(deal.properties[`hs_v2_date_entered_${STAGE_IDS.INTERVIEW_SCHED}`]),
    ts(deal.properties[`hs_v2_date_entered_${STAGE_IDS.AGREEMENT_SENT}`]),
  ].filter((d): d is number => d !== null);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

function pct(num: number, denom: number): number {
  if (denom === 0) return 0;
  return Math.round((num / denom) * 1000) / 10;
}

// ── computeMonthlyMetrics ──────────────────────────────────────────────────────
//
// Each failing metric uses a DEDICATED deal set so there is no cross-contamination.
//
//  defaultDeals    — pipeline=default, createdate >= 2026-01.
//                    Handles: calls booked, no-shows, billing entered, missed zoom
//                    breakdown, billing breakdown, post-billing sub-stages, cohort.
//
//  parkingLotDeals — queried by hs_v2_date_entered_1063655701, no createdate/pipeline
//                    filter. Handles: parking lot count only.
//
//  closedLostDeals — queried by hs_v2_date_entered_28817241 AND pipeline=default.
//                    Handles: closed lost count only.
//
//  postBillingDeals— queried by each post-billing stage date, no createdate filter.
//                    Merged with defaultDeals to form "wonPool" for closed won count.
//
//  acDeals         — queried by hs_v2_date_entered_12751919, all pipelines.
//                    Handles: active client count only.

export function computeMonthlyMetrics(
  defaultDeals: Deal[],
  parkingLotDeals: Deal[],
  closedLostDeals: Deal[],
  postBillingDeals: Deal[],
  acDeals: Deal[],
  wonPool: Deal[],        // mergeDeals(defaultDeals, postBillingDeals) — pre-computed
  monthKey: string
): MonthlyMetrics {
  // ── Default pipeline: calls booked, no-shows, billing, cohort, breakdowns ────
  let callsBooked = 0, noShows = 0, billingEntered = 0;
  let missedZoom_cl = 0, missedZoom_rebooked = 0, missedZoom_open = 0;
  let billing_cl = 0, billing_progressed = 0, billing_active = 0;
  let recruiting = 0, resumesSent = 0, interviewScheduled = 0, agreementSent = 0;
  let cohort_leads = 0, cohort_booked = 0, cohort_noshow = 0, cohort_pipeline = 0, cohort_active = 0;

  for (const deal of defaultDeals) {
    const p = deal.properties;

    // Belt-and-suspenders pipeline guard.
    const isDefaultPipeline = p.pipeline === "default";
    // Valid-lead filter: must have passed through the Lead (appointmentscheduled) stage.
    // Applied to both callsBooked AND noShows so the subtraction (attended) is consistent.
    // Confirmed correct counts from HubSpot: zoom booked 1,875 / no-shows 701 / attended 1,174.
    const hasApptScheduled = !!p.hs_v2_date_entered_appointmentscheduled;

    if (isDefaultPipeline && hasApptScheduled && inMonth(p[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`], monthKey)) callsBooked++;
    if (isDefaultPipeline && hasApptScheduled && inMonth(p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`], monthKey)) noShows++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`], monthKey)) billingEntered++;

    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.RECRUITING}`], monthKey)) recruiting++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.RESUMES_SENT}`], monthKey)) resumesSent++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.INTERVIEW_SCHED}`], monthKey)) interviewScheduled++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.AGREEMENT_SENT}`], monthKey)) agreementSent++;

    // Missed Zoom breakdown
    if (isDefaultPipeline && hasApptScheduled && inMonth(p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`], monthKey)) {
      const missedTs = ts(p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`]);
      const zoomTs = ts(p[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]);
      const rebooked = missedTs !== null && zoomTs !== null && zoomTs > missedTs;
      const hasCL = !!p[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`];
      if (rebooked) missedZoom_rebooked++;
      else if (hasCL) missedZoom_cl++;
      else missedZoom_open++;
    }

    // Billing breakdown
    if (isDefaultPipeline && hasApptScheduled && inMonth(p[`hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`], monthKey)) {
      const hasCL = !!p[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`];
      const progressed = earliestPostBillingTs(deal) !== null;
      if (progressed) billing_progressed++;
      else if (hasCL) billing_cl++;
      else billing_active++;
    }

    // Cohort: deals where Lead date is in this month
    if (inMonth(p.hs_v2_date_entered_appointmentscheduled, monthKey)) {
      cohort_leads++;
      if (p[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]) cohort_booked++;
      if (p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`]) cohort_noshow++;
      if (earliestPostBillingTs(deal) !== null) cohort_pipeline++;
      if (p[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`]) cohort_active++;
    }
  }

  // ── Parking Lot — dedicated set (no pipeline/createdate filter at query) ──────
  let parkingLot = 0;
  for (const deal of parkingLotDeals) {
    if (inMonth(deal.properties[`hs_v2_date_entered_${STAGE_IDS.PARKING_LOT}`], monthKey)) {
      parkingLot++;
    }
  }

  // ── Closed Lost — dedicated set (pipeline=default enforced at HubSpot level) ──
  let closedLost = 0;
  for (const deal of closedLostDeals) {
    if (inMonth(deal.properties[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`], monthKey)) {
      closedLost++;
    }
  }

  // ── Closed Won — wonPool (defaultDeals merged with postBillingDeals) ───────────
  // Uses brief definition: earliest post-billing date falls in month AND isValidLead.
  let closedWon = 0;
  for (const deal of wonPool) {
    const cwTs = earliestPostBillingTs(deal);
    if (cwTs !== null && inMonth(new Date(cwTs).toISOString(), monthKey)) {
      closedWon++;
    }
  }

  // ── Active Client — dedicated AC set (all pipelines, inMonth on AC date) ──────
  let activeClient = 0;
  for (const deal of acDeals) {
    if (inMonth(deal.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`], monthKey)) {
      activeClient++;
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const attended = Math.max(0, callsBooked - noShows);
  const dropOffs = Math.max(0, attended - billingEntered - parkingLot);
  const dropRate = attended > 0 ? Math.round((dropOffs / attended) * 1000) / 10 : 0;

  const [y, m] = monthKey.split("-").map(Number);
  const monthEndMs = Date.UTC(y, m, 1);
  const daysOld = Math.floor((Date.now() - monthEndMs) / (1000 * 60 * 60 * 24));
  let cohort_maturity: MonthlyMetrics["cohort_maturity"];
  if (daysOld < 14) cohort_maturity = "too_early";
  else if (daysOld < 42) cohort_maturity = "immature";
  else if (daysOld < 90) cohort_maturity = "partial";
  else cohort_maturity = "mature";

  return {
    month: monthKey,
    callsBooked, noShows, attended, billingEntered, parkingLot,
    dropOffs, dropRate, closedWon, activeClient, closedLost,
    missedZoom_cl, missedZoom_rebooked, missedZoom_open,
    billing_cl, billing_progressed, billing_active,
    recruiting, resumesSent, interviewScheduled, agreementSent,
    cohort_leads,
    cohort_bookRate: pct(cohort_booked, cohort_leads),
    cohort_noShowRate: pct(cohort_noshow, cohort_booked),
    cohort_pipelineRate: pct(cohort_pipeline, cohort_leads),
    cohort_activeRate: pct(cohort_active, cohort_leads),
    cohort_daysOld: daysOld,
    cohort_maturity,
  };
}

// ── computeAllMonths ───────────────────────────────────────────────────────────

export function computeAllMonths(
  defaultDeals: Deal[],
  parkingLotDeals: Deal[],
  closedLostDeals: Deal[],
  postBillingDeals: Deal[],
  acDeals: Deal[],
  wonPool: Deal[]
): Record<string, MonthlyMetrics> {
  const result: Record<string, MonthlyMetrics> = {};
  for (const m of monthsSince("2026-01")) {
    result[m] = computeMonthlyMetrics(
      defaultDeals, parkingLotDeals, closedLostDeals, postBillingDeals, acDeals, wonPool, m
    );
  }
  return result;
}

// ── Initiative helpers ─────────────────────────────────────────────────────────

function filterByDateProp(deals: Deal[], prop: string, fromMs: number, toMs: number): Deal[] {
  return deals.filter((d) => {
    const t = ts(d.properties[prop as keyof Deal["properties"]]);
    return t !== null && t >= fromMs && t <= toMs;
  });
}

function filterByDatePropGTE(deals: Deal[], prop: string, fromMs: number): Deal[] {
  return deals.filter((d) => {
    const t = ts(d.properties[prop as keyof Deal["properties"]]);
    return t !== null && t >= fromMs;
  });
}

function aggregateInit01Cohort(deals: Deal[]): CohortMetrics {
  const enrolled = deals.length;
  let meetings = 0, pipeline = 0, active = 0, clNoMeeting = 0;
  for (const d of deals) {
    const hasZoom = !!d.properties[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`];
    const hasPipeline = earliestPostBillingTs(d) !== null;
    const hasActive = !!d.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`];
    const hasCL = !!d.properties[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`];
    if (hasZoom) meetings++;
    if (hasPipeline) pipeline++;
    if (hasActive) active++;
    if (hasCL && !hasZoom) clNoMeeting++;
  }
  return {
    enrolled, meetingRate: pct(meetings, enrolled), pipelineRate: pct(pipeline, enrolled),
    activeRate: pct(active, enrolled), clNoMeetingRate: pct(clNoMeeting, enrolled),
    rebookRate: 0, billingClRate: 0, avgDaysToPipeline: 0, cohortAgeDays: 0, isMature: false,
  };
}

function aggregateInit02Cohort(deals: Deal[], entryProp: string): CohortMetrics {
  const enrolled = deals.length;
  let rebooked = 0, pipeline = 0, active = 0, clRate = 0;
  for (const d of deals) {
    const entryTs = ts(d.properties[entryProp as keyof Deal["properties"]]);
    const zoomTs = ts(d.properties[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]);
    if (entryTs !== null && zoomTs !== null && zoomTs > entryTs) rebooked++;
    if (earliestPostBillingTs(d) !== null) pipeline++;
    if (d.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`]) active++;
    if (d.properties[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`]) clRate++;
  }
  return {
    enrolled, meetingRate: 0, pipelineRate: pct(pipeline, enrolled),
    activeRate: pct(active, enrolled), clNoMeetingRate: pct(clRate, enrolled),
    rebookRate: pct(rebooked, enrolled), billingClRate: 0, avgDaysToPipeline: 0,
    cohortAgeDays: 0, isMature: false,
  };
}

function aggregateInit04Cohort(deals: Deal[]): CohortMetrics {
  const enrolled = deals.length;
  let billingCL = 0, totalDays = 0, velocityCount = 0;
  for (const d of deals) {
    const billingTs = ts(d.properties[`hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`]);
    const recruitTs = ts(d.properties[`hs_v2_date_entered_${STAGE_IDS.RECRUITING}`]);
    const hasCL = !!d.properties[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`];
    if (hasCL && earliestPostBillingTs(d) === null) billingCL++;
    if (billingTs !== null && recruitTs !== null && recruitTs > billingTs) {
      totalDays += (recruitTs - billingTs) / 86400000;
      velocityCount++;
    }
  }
  return {
    enrolled, meetingRate: 0, pipelineRate: 0, activeRate: 0, clNoMeetingRate: 0,
    rebookRate: 0, billingClRate: pct(billingCL, enrolled),
    avgDaysToPipeline: velocityCount > 0 ? Math.round((totalDays / velocityCount) * 10) / 10 : 0,
    cohortAgeDays: 0, isMature: false,
  };
}

export function computeInitiatives(defaultDeals: Deal[]): Record<string, InitiativeSnapshot> {
  const enrolledProp = `hs_v2_date_entered_${STAGE_IDS.ENROLLED_IN_SEQ}`;
  const missedProp   = `hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`;
  const billingProp  = `hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`;
  const zoomProp     = `hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`;

  return {
    "01": {
      id: "01",
      old: aggregateInit01Cohort(filterByDateProp(defaultDeals, enrolledProp, Date.UTC(2026,0,26), Date.UTC(2026,4,16,23,59,59,999))),
      new: aggregateInit01Cohort(filterByDatePropGTE(defaultDeals, enrolledProp, Date.UTC(2026,4,19))),
    },
    "02": {
      id: "02",
      old: aggregateInit02Cohort(filterByDateProp(defaultDeals, missedProp, Date.UTC(2026,0,1), Date.UTC(2026,4,26,23,59,59,999)), missedProp),
      new: aggregateInit02Cohort(filterByDatePropGTE(defaultDeals, missedProp, Date.UTC(2026,4,27)), missedProp),
    },
    "03": {
      id: "03",
      old: aggregateInit02Cohort(filterByDateProp(defaultDeals, missedProp, Date.UTC(2026,1,22), Date.UTC(2026,2,7,23,59,59,999)), missedProp),
      new: aggregateInit02Cohort(filterByDatePropGTE(defaultDeals, missedProp, Date.UTC(2026,3,8)), missedProp),
    },
    "04": {
      id: "04",
      old: aggregateInit04Cohort(defaultDeals.filter(d => { const t = ts(d.properties[billingProp as keyof Deal["properties"]]); return t !== null && t < Date.UTC(2026,4,11); })),
      new: aggregateInit04Cohort(filterByDatePropGTE(defaultDeals, billingProp, Date.UTC(2026,4,11))),
    },
    "05": {
      id: "05",
      old: aggregateInit01Cohort(filterByDatePropGTE(defaultDeals, zoomProp, Date.UTC(2026,0,1))),
      new: aggregateInit01Cohort([]),
    },
  };
}
