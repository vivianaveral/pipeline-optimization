import type { Deal, MonthlyMetrics, CohortMetrics, InitiativeSnapshot } from "./types";
import { STAGE_IDS } from "./stages";

// ── Helpers ────────────────────────────────────────────────────────────────────

function ts(val: string | null | undefined): number | null {
  if (!val) return null;
  const t = new Date(val).getTime();
  return isNaN(t) ? null : t;
}

function inRange(val: string | null | undefined, start: number, end: number): boolean {
  const t = ts(val);
  return t !== null && t >= start && t <= end;
}

/** isValidLead: any of Lead / Enrolled / Zoom dates is set */
function isValidLead(deal: Deal): boolean {
  return !!(
    deal.properties.hs_v2_date_entered_appointmentscheduled ||
    deal.properties[`hs_v2_date_entered_${STAGE_IDS.ENROLLED_IN_SEQ}`] ||
    deal.properties[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]
  );
}

/** Earliest date a deal entered any post-billing stage (Recruiting/Resumes/Interview/Agreement) */
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

// ── Monthly bounds ─────────────────────────────────────────────────────────────

function monthBounds(monthKey: string): { start: number; end: number } {
  const [y, m] = monthKey.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

// ── computeMonthlyMetrics ──────────────────────────────────────────────────────
// allDeals: merged set (default pipeline + active client deals)
// defaultDeals: only the default pipeline deals (for metrics that should exclude CS pipeline)

export function computeMonthlyMetrics(
  allDeals: Deal[],
  monthKey: string
): MonthlyMetrics {
  const { start, end } = monthBounds(monthKey);

  // Activity counters (default pipeline included in allDeals)
  let callsBooked = 0, noShows = 0, billingEntered = 0, parkingLot = 0;
  let closedWon = 0, closedLost = 0;
  let missedZoom_cl = 0, missedZoom_rebooked = 0, missedZoom_open = 0;
  let billing_cl = 0, billing_progressed = 0, billing_active = 0;
  let recruiting = 0, resumesSent = 0, interviewScheduled = 0, agreementSent = 0;
  let cohort_leads = 0, cohort_booked = 0, cohort_noshow = 0, cohort_pipeline = 0, cohort_active = 0;
  let activeClient = 0;

  for (const deal of allDeals) {
    const p = deal.properties;

    // Active client — from ALL pipelines
    if (inRange(p.hs_v2_date_entered_12751919, start, end)) activeClient++;

    // Skip non-default pipeline deals for all other metrics
    if (deal.properties.pipeline !== "default") continue;

    // Sales Pipeline Activity metrics
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`], start, end)) callsBooked++;
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`], start, end)) noShows++;
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`], start, end)) billingEntered++;
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.PARKING_LOT}`], start, end)) parkingLot++;
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`], start, end)) closedLost++;

    const cwDate = closedWonDate(deal);
    if (cwDate !== null && cwDate >= start && cwDate <= end) closedWon++;

    // Post-billing sub-stage activity
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.RECRUITING}`], start, end)) recruiting++;
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.RESUMES_SENT}`], start, end)) resumesSent++;
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.INTERVIEW_SCHED}`], start, end)) interviewScheduled++;
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.AGREEMENT_SENT}`], start, end)) agreementSent++;

    // Missed Zoom breakdown: classify deals where missed zoom date is in this month
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`], start, end)) {
      const missedTs = ts(p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`]);
      const zoomTs = ts(p[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]);
      const rebooked = missedTs !== null && zoomTs !== null && zoomTs > missedTs;
      const hasCL = !!p[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`];

      if (rebooked) missedZoom_rebooked++;
      else if (hasCL) missedZoom_cl++;
      else missedZoom_open++;
    }

    // Billing breakdown: classify deals where billing date is in this month
    if (inRange(p[`hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`], start, end)) {
      const hasCL = !!p[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`];
      const progressed = closedWonDate(deal) !== null;

      if (progressed) billing_progressed++;
      else if (hasCL) billing_cl++;
      else billing_active++;
    }

    // Cohort: deals where Lead (appointmentscheduled) date is in this month
    if (inRange(p.hs_v2_date_entered_appointmentscheduled, start, end)) {
      cohort_leads++;
      if (p[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`]) cohort_booked++;
      if (p[`hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`]) cohort_noshow++;
      if (closedWonDate(deal) !== null) cohort_pipeline++;
      if (p.hs_v2_date_entered_12751919) cohort_active++;
    }
  }

  const attended = Math.max(0, callsBooked - noShows);
  const dropOffs = Math.max(0, attended - billingEntered - parkingLot);
  const dropRate = attended > 0 ? Math.round((dropOffs / attended) * 1000) / 10 : 0;

  // Cohort maturity
  const [y, m] = monthKey.split("-").map(Number);
  const monthEndMs = Date.UTC(y, m, 1); // start of next month = end of this month
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

// ── Initiative helpers ─────────────────────────────────────────────────────────

function filterByDateProp(
  deals: Deal[],
  prop: string,
  fromMs: number,
  toMs: number
): Deal[] {
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
    const hasActive = !!d.properties.hs_v2_date_entered_12751919;
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
    // Rebooked = zoom booked date STRICTLY AFTER missed zoom date
    const rebookedDeal = entryTs !== null && zoomTs !== null && zoomTs > entryTs;
    if (rebookedDeal) rebooked++;
    if (closedWonDate(d) !== null) pipeline++;
    if (d.properties.hs_v2_date_entered_12751919) active++;
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

// ── computeInitiatives ─────────────────────────────────────────────────────────

export function computeInitiatives(
  deals: Deal[]
): Record<string, InitiativeSnapshot> {
  // Only default pipeline deals for all initiatives (Active Client is looked up per deal)
  const defaultDeals = deals.filter((d) => d.properties.pipeline === "default");

  const enrolledProp = `hs_v2_date_entered_${STAGE_IDS.ENROLLED_IN_SEQ}`;
  const missedProp = `hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`;
  const billingProp = `hs_v2_date_entered_${STAGE_IDS.GETTING_BILLING}`;

  // Init 01 — Form fill / no call booked
  const i01Old = filterByDateProp(defaultDeals, enrolledProp,
    Date.UTC(2026, 0, 26), Date.UTC(2026, 4, 16, 23, 59, 59, 999));
  const i01New = filterByDatePropGTE(defaultDeals, enrolledProp, Date.UTC(2026, 4, 19));

  // Init 02 — Missed Zoom Call
  const i02Old = filterByDateProp(defaultDeals, missedProp,
    Date.UTC(2026, 0, 1), Date.UTC(2026, 4, 26, 23, 59, 59, 999));
  const i02New = filterByDatePropGTE(defaultDeals, missedProp, Date.UTC(2026, 4, 27));

  // Init 03 — TZ Rebook (same entry as 02 but different date range)
  const i03Old = filterByDateProp(defaultDeals, missedProp,
    Date.UTC(2026, 1, 22), Date.UTC(2026, 2, 7, 23, 59, 59, 999));
  const i03New = filterByDatePropGTE(defaultDeals, missedProp, Date.UTC(2026, 3, 8));

  // Init 04 — 48hr Call Tasks (billing + recruiting)
  const i04Old = defaultDeals.filter((d) => {
    const t = ts(d.properties[billingProp as keyof Deal["properties"]]);
    return t !== null && t < Date.UTC(2026, 4, 11);
  });
  const i04New = filterByDatePropGTE(defaultDeals, billingProp, Date.UTC(2026, 4, 11));

  // Init 05 — Pre-Meeting Email (no new cohort yet)
  const i05Old = filterByDatePropGTE(defaultDeals, `hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`, Date.UTC(2026, 0, 1));
  const i05New: Deal[] = [];

  return {
    "01": { id: "01", old: aggregateInit01Cohort(i01Old), new: aggregateInit01Cohort(i01New) },
    "02": { id: "02", old: aggregateInit02Cohort(i02Old, missedProp), new: aggregateInit02Cohort(i02New, missedProp) },
    "03": { id: "03", old: aggregateInit02Cohort(i03Old, missedProp), new: aggregateInit02Cohort(i03New, missedProp) },
    "04": { id: "04", old: aggregateInit04Cohort(i04Old), new: aggregateInit04Cohort(i04New) },
    "05": { id: "05", old: aggregateInit01Cohort(i05Old), new: aggregateInit01Cohort(i05New) },
  };
}

// ── computeAllMonths ───────────────────────────────────────────────────────────

export function computeAllMonths(
  allDeals: Deal[]
): Record<string, MonthlyMetrics> {
  const months = monthsSince("2026-01");
  const result: Record<string, MonthlyMetrics> = {};
  for (const m of months) {
    result[m] = computeMonthlyMetrics(allDeals, m);
  }
  return result;
}

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
