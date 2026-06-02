import type { Deal, MonthlyMetrics, CohortMetrics, InitiativeSnapshot } from "./types";
import { STAGE_IDS } from "./stages";

// ── Date helpers ───────────────────────────────────────────────────────────────

/**
 * Check if a HubSpot date string falls within a given month.
 * Uses string prefix matching ("2026-05-...".startsWith("2026-05")) — robust
 * against timezone edge cases and avoids timestamp arithmetic entirely.
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

/** isValidLead: any of Lead / Enrolled / Zoom dates is set (per brief) */
function isValidLead(deal: Deal): boolean {
  return !!(
    deal.properties.hs_v2_date_entered_appointmentscheduled ||
    deal.properties[`hs_v2_date_entered_${STAGE_IDS.ENROLLED_IN_SEQ}`] ||
    deal.properties[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]
  );
}

/**
 * Earliest date a deal entered any post-billing stage.
 * Brief definition: Recruiting / Resumes Sent / Interview Scheduled / Agreement Sent.
 * A deal is "Closed Won" when this date falls within the selected month.
 */
function closedWonDate(deal: Deal): number | null {
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
// salesDeals  — default pipeline only (createdate + parking-lot + post-billing fetches merged).
//               Used for all sales funnel metrics: calls booked, no-shows, billing,
//               parking lot, closed lost, closed won, post-billing sub-stages, cohort.
//
// acDeals     — active client deals, ALL pipelines, fetched by AC stage date.
//               Used ONLY for the active client count.
//               Kept separate to prevent CS-pipeline deals (which may also have closed-lost
//               dates set) from inflating the closed-lost or any other metric.

export function computeMonthlyMetrics(
  salesDeals: Deal[],
  acDeals: Deal[],
  monthKey: string
): MonthlyMetrics {
  let callsBooked = 0, noShows = 0, billingEntered = 0, parkingLot = 0;
  let closedWon = 0, closedLost = 0;
  let missedZoom_cl = 0, missedZoom_rebooked = 0, missedZoom_open = 0;
  let billing_cl = 0, billing_progressed = 0, billing_active = 0;
  let recruiting = 0, resumesSent = 0, interviewScheduled = 0, agreementSent = 0;
  let cohort_leads = 0, cohort_booked = 0, cohort_noshow = 0, cohort_pipeline = 0, cohort_active = 0;

  // ── Sales funnel metrics — salesDeals only (strictly default pipeline) ──────
  for (const deal of salesDeals) {
    const p = deal.properties;

    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`], monthKey)) callsBooked++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`], monthKey)) noShows++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`], monthKey)) billingEntered++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.PARKING_LOT}`], monthKey)) parkingLot++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`], monthKey)) closedLost++;

    // Closed Won: earliest post-billing date in this month
    const cwTs = closedWonDate(deal);
    if (cwTs !== null && inMonth(new Date(cwTs).toISOString(), monthKey)) closedWon++;

    // Post-billing sub-stage activity
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.RECRUITING}`], monthKey)) recruiting++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.RESUMES_SENT}`], monthKey)) resumesSent++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.INTERVIEW_SCHED}`], monthKey)) interviewScheduled++;
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.AGREEMENT_SENT}`], monthKey)) agreementSent++;

    // Missed Zoom breakdown: deals where missed zoom date is in this month
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`], monthKey)) {
      const missedTs = ts(p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`]);
      const zoomTs = ts(p[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]);
      const rebooked = missedTs !== null && zoomTs !== null && zoomTs > missedTs;
      const hasCL = !!p[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`];

      if (rebooked) missedZoom_rebooked++;
      else if (hasCL) missedZoom_cl++;
      else missedZoom_open++;
    }

    // Billing breakdown: deals where billing date is in this month
    if (inMonth(p[`hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`], monthKey)) {
      const hasCL = !!p[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`];
      const progressed = closedWonDate(deal) !== null;

      if (progressed) billing_progressed++;
      else if (hasCL) billing_cl++;
      else billing_active++;
    }

    // Cohort: deals where Lead (appointmentscheduled) date is in this month
    if (inMonth(p.hs_v2_date_entered_appointmentscheduled, monthKey)) {
      cohort_leads++;
      if (p[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]) cohort_booked++;
      if (p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`]) cohort_noshow++;
      if (closedWonDate(deal) !== null) cohort_pipeline++;
      if (p[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`]) cohort_active++;
    }
  }

  // ── Active Client — acDeals only (all pipelines, strictly filtered by AC date) ──
  let activeClient = 0;
  for (const deal of acDeals) {
    if (inMonth(deal.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`], monthKey)) {
      activeClient++;
    }
  }

  // ── Derived metrics ────────────────────────────────────────────────────────────
  const attended = Math.max(0, callsBooked - noShows);
  const dropOffs = Math.max(0, attended - billingEntered - parkingLot);
  const dropRate = attended > 0 ? Math.round((dropOffs / attended) * 1000) / 10 : 0;

  // Cohort maturity
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
    callsBooked,
    noShows,
    attended,
    billingEntered,
    parkingLot,
    dropOffs,
    dropRate,
    closedWon,
    activeClient,
    closedLost,
    missedZoom_cl,
    missedZoom_rebooked,
    missedZoom_open,
    billing_cl,
    billing_progressed,
    billing_active,
    recruiting,
    resumesSent,
    interviewScheduled,
    agreementSent,
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
  salesDeals: Deal[],
  acDeals: Deal[]
): Record<string, MonthlyMetrics> {
  const months = monthsSince("2026-01");
  const result: Record<string, MonthlyMetrics> = {};
  for (const m of months) {
    result[m] = computeMonthlyMetrics(salesDeals, acDeals, m);
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
    const hasPipeline = closedWonDate(d) !== null;
    const hasActive = !!d.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`];
    const hasCL = !!d.properties[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`];
    if (hasZoom) meetings++;
    if (hasPipeline) pipeline++;
    if (hasActive) active++;
    if (hasCL && !hasZoom) clNoMeeting++;
  }
  return {
    enrolled,
    meetingRate: pct(meetings, enrolled),
    pipelineRate: pct(pipeline, enrolled),
    activeRate: pct(active, enrolled),
    clNoMeetingRate: pct(clNoMeeting, enrolled),
    rebookRate: 0,
    billingClRate: 0,
    avgDaysToPipeline: 0,
    cohortAgeDays: 0,
    isMature: false,
  };
}

function aggregateInit02Cohort(deals: Deal[], entryProp: string): CohortMetrics {
  const enrolled = deals.length;
  let rebooked = 0, pipeline = 0, active = 0, clRate = 0;
  for (const d of deals) {
    const entryTs = ts(d.properties[entryProp as keyof Deal["properties"]]);
    const zoomTs = ts(d.properties[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]);
    const rebookedDeal = entryTs !== null && zoomTs !== null && zoomTs > entryTs;
    if (rebookedDeal) rebooked++;
    if (closedWonDate(d) !== null) pipeline++;
    if (d.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`]) active++;
    if (d.properties[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`]) clRate++;
  }
  return {
    enrolled,
    meetingRate: 0,
    pipelineRate: pct(pipeline, enrolled),
    activeRate: pct(active, enrolled),
    clNoMeetingRate: pct(clRate, enrolled),
    rebookRate: pct(rebooked, enrolled),
    billingClRate: 0,
    avgDaysToPipeline: 0,
    cohortAgeDays: 0,
    isMature: false,
  };
}

function aggregateInit04Cohort(deals: Deal[]): CohortMetrics {
  const enrolled = deals.length;
  let billingCL = 0;
  let totalDays = 0, velocityCount = 0;
  for (const d of deals) {
    const billingTs = ts(d.properties[`hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`]);
    const recruitTs = ts(d.properties[`hs_v2_date_entered_${STAGE_IDS.RECRUITING}`]);
    const hasCL = !!d.properties[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`];
    const hasPipeline = closedWonDate(d) !== null;
    if (hasCL && !hasPipeline) billingCL++;
    if (billingTs !== null && recruitTs !== null && recruitTs > billingTs) {
      totalDays += (recruitTs - billingTs) / (1000 * 60 * 60 * 24);
      velocityCount++;
    }
  }
  return {
    enrolled,
    meetingRate: 0,
    pipelineRate: 0,
    activeRate: 0,
    clNoMeetingRate: 0,
    rebookRate: 0,
    billingClRate: pct(billingCL, enrolled),
    avgDaysToPipeline: velocityCount > 0 ? Math.round((totalDays / velocityCount) * 10) / 10 : 0,
    cohortAgeDays: 0,
    isMature: false,
  };
}

export function computeInitiatives(salesDeals: Deal[]): Record<string, InitiativeSnapshot> {
  const enrolledProp = `hs_v2_date_entered_${STAGE_IDS.ENROLLED_IN_SEQ}`;
  const missedProp = `hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`;
  const billingProp = `hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`;

  const i01Old = filterByDateProp(salesDeals, enrolledProp,
    Date.UTC(2026, 0, 26), Date.UTC(2026, 4, 16, 23, 59, 59, 999));
  const i01New = filterByDatePropGTE(salesDeals, enrolledProp, Date.UTC(2026, 4, 19));

  const i02Old = filterByDateProp(salesDeals, missedProp,
    Date.UTC(2026, 0, 1), Date.UTC(2026, 4, 26, 23, 59, 59, 999));
  const i02New = filterByDatePropGTE(salesDeals, missedProp, Date.UTC(2026, 4, 27));

  const i03Old = filterByDateProp(salesDeals, missedProp,
    Date.UTC(2026, 1, 22), Date.UTC(2026, 2, 7, 23, 59, 59, 999));
  const i03New = filterByDatePropGTE(salesDeals, missedProp, Date.UTC(2026, 3, 8));

  const i04Old = salesDeals.filter((d) => {
    const t = ts(d.properties[billingProp as keyof Deal["properties"]]);
    return t !== null && t < Date.UTC(2026, 4, 11);
  });
  const i04New = filterByDatePropGTE(salesDeals, billingProp, Date.UTC(2026, 4, 11));

  const i05Old = filterByDatePropGTE(salesDeals,
    `hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`, Date.UTC(2026, 0, 1));
  const i05New: Deal[] = [];

  return {
    "01": { id: "01", old: aggregateInit01Cohort(i01Old), new: aggregateInit01Cohort(i01New) },
    "02": { id: "02", old: aggregateInit02Cohort(i02Old, missedProp), new: aggregateInit02Cohort(i02New, missedProp) },
    "03": { id: "03", old: aggregateInit02Cohort(i03Old, missedProp), new: aggregateInit02Cohort(i03New, missedProp) },
    "04": { id: "04", old: aggregateInit04Cohort(i04Old), new: aggregateInit04Cohort(i04New) },
    "05": { id: "05", old: aggregateInit01Cohort(i05Old), new: aggregateInit01Cohort(i05New) },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function monthsSince(fromYYYYMM: string): string[] {
  const [fy, fm] = fromYYYYMM.split("-").map(Number);
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  const months: string[] = [];
  for (let y = fy, mo = fm; y < cy || (y === cy && mo <= cm); ) {
    months.push(`${y}-${String(mo).padStart(2, "0")}`);
    if (mo === 12) { y++; mo = 1; } else mo++;
  }
  return months;
}
