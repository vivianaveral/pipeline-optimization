import { EXCLUDED_CONTACTS } from "@/config/exclusions";
import { POST_BILLING_STAGES, STAGE_IDS } from "@/config/initiatives";

const HUBSPOT_BASE = "https://api.hubspot.com/crm/v3/objects/deals/search";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const PAGE_DELAY_MS = 250;

interface HubSpotDeal {
  id: string;
  properties: Record<string, string | null>;
  // Present when the query includes associations: ["contacts"]
  associations?: {
    contacts?: { results: Array<{ id: string; type: string }> };
  };
}

interface SearchQuery {
  filterGroups: Array<{
    filters: Array<{
      propertyName: string;
      operator: string;
      value?: string;
      highValue?: string;
      values?: string[];
    }>;
  }>;
  properties: string[];
  limit: number;
  after?: string;
  associations?: string[]; // e.g. ["contacts"] — returns contact IDs per deal
}

const DEAL_PROPERTIES = [
  "dealstage",
  "hs_v2_date_entered_appointmentscheduled",
  "hs_v2_date_entered_28807353",
  "hs_v2_date_entered_13542462",
  "hs_v2_date_entered_28817239",
  "hs_v2_date_entered_22600467",
  "hs_v2_date_entered_5423787",
  "hs_v2_date_entered_5568500",
  "hs_v2_date_entered_12635527",
  "hs_v2_date_entered_13812915",
  "hs_v2_date_entered_28817241",
  "hs_v2_date_entered_16160504",
  "hs_v2_date_entered_12751919",
  "hs_v2_date_entered_12751924",
  "sales_agent",
  "outbound_rep",
  "createdate",
  "closedate",
];

// ── Exclusion filter ─────────────────────────────────────────────────────────

function getExclusionFilter() {
  if (EXCLUDED_CONTACTS.length === 0) return [];
  return [
    {
      propertyName: "associations.contact",
      operator: "NOT_IN",
      values: EXCLUDED_CONTACTS.map((e) => e.contactId),
    },
  ];
}

// ── Pagination ────────────────────────────────────────────────────────────────

async function fetchAllDeals(token: string, query: SearchQuery): Promise<HubSpotDeal[]> {
  const deals: HubSpotDeal[] = [];
  let after: string | undefined;

  do {
    const body: SearchQuery = { ...query, limit: 200 };
    if (after) body.after = after;

    const res = await fetch(HUBSPOT_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HubSpot API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    deals.push(...(data.results ?? []));
    after = data.paging?.next?.after;
    if (after) await sleep(PAGE_DELAY_MS);
  } while (after);

  return deals;
}

// ── New-lead filter (Fix 1) ──────────────────────────────────────────────────
// Exclude deals where the associated contact already had an active placement
// (hs_v2_date_entered_12751919) on an earlier deal, before this deal's lead date.

/** Contact IDs associated with a deal (requires associations:["contacts"] in query). */
function getDealContactIds(deal: HubSpotDeal): string[] {
  return deal.associations?.contacts?.results?.map((c) => c.id) ?? [];
}

/**
 * Build a map of contactId → earliest active-client timestamp across all deals.
 * Called once before the main queries to avoid per-deal lookups.
 */
async function buildPriorPlacementMap(
  token: string,
  exclusionFilter: ReturnType<typeof getExclusionFilter>
): Promise<Map<string, number>> {
  console.log("[hubspot] Building prior-placement map (contacts with prior active client deals)...");
  const placedDeals = await fetchAllDeals(token, {
    filterGroups: [
      {
        filters: [
          { propertyName: `hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`, operator: "HAS_PROPERTY" },
          ...exclusionFilter,
        ],
      },
    ],
    properties: [`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`],
    associations: ["contacts"],
    limit: 200,
  });

  const map = new Map<string, number>();
  for (const deal of placedDeals) {
    const activeStr = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`];
    if (!activeStr) continue;
    const activeTs = new Date(activeStr).getTime();
    for (const cid of getDealContactIds(deal)) {
      const prev = map.get(cid);
      if (prev === undefined || activeTs < prev) map.set(cid, activeTs);
    }
  }
  console.log(`[hubspot] Prior-placement map: ${map.size} contacts with ≥1 prior active client deal`);
  return map;
}

/**
 * Returns true if this deal is a "new lead" — the associated contact had no
 * active placement on any other deal before this deal's lead-entry date.
 * Deals with no lead date are included (can't determine, safe to keep).
 */
function isNewLead(deal: HubSpotDeal, priorMap: Map<string, number>): boolean {
  const leadStr = deal.properties[`hs_v2_date_entered_${STAGE_IDS.LEAD}`];
  if (!leadStr) return true;
  const leadTs = new Date(leadStr).getTime();
  for (const cid of getDealContactIds(deal)) {
    const priorTs = priorMap.get(cid);
    if (priorTs !== undefined && priorTs < leadTs) return false;
  }
  return true;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Converts "YYYY-MM-DD" to the last millisecond of that day (UTC), for inclusive BETWEEN. */
function toEndOfDay(dateStr: string): string {
  return `${dateStr}T23:59:59.999Z`;
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function getPostBillingDate(deal: HubSpotDeal): number | null {
  const dates = POST_BILLING_STAGES.map((stageId) => {
    const val = deal.properties[`hs_v2_date_entered_${stageId}`];
    return val ? new Date(val).getTime() : null;
  }).filter((d): d is number => d !== null);
  return dates.length > 0 ? Math.min(...dates) : null;
}

type ClosedLostCategory = "cl_never_met" | "cl_booked_no_pipeline" | "cl_pipeline_no_place" | null;

function classifyClosedLost(deal: HubSpotDeal): ClosedLostCategory {
  const hasCL =
    deal.properties[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`] ||
    deal.properties[`hs_v2_date_entered_${STAGE_IDS.DO_NOT_CONTACT}`];
  if (!hasCL) return null;

  const hasZoom   = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`];
  const hasPB     = getPostBillingDate(deal);
  const hasActive = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`];

  if (!hasZoom) return "cl_never_met";
  if (!hasPB)   return "cl_booked_no_pipeline";
  if (!hasActive) return "cl_pipeline_no_place";
  return "cl_pipeline_no_place";
}

// ── MotionMetrics ─────────────────────────────────────────────────────────────

export interface MotionMetrics {
  enrolled: number;
  meetings_booked: number;
  pipeline_entered: number;
  active_client: number;
  terminated: number;
  cl_never_met: number;
  cl_booked_no_pipeline: number;
  cl_pipeline_no_place: number;
  still_open: number;
  enroll_to_meeting_pct: number;
  enroll_to_pipeline_pct: number;
  enroll_to_active_pct: number;
  cl_no_meeting_pct: number;
  cohort_age_days: number;
  is_mature: boolean;
  maturity_threshold_days: number;
  weekly: Array<{ week: string; enrolled: number; meetings: number }>;
}

function aggregateDeals(
  deals: HubSpotDeal[],
  entryProperty: string,
  maturityDays: number,
  motionDateFrom: string,
  meetingAfterEntryOnly = false
): MotionMetrics {
  // Fix 4: meetingAfterEntryOnly=true for Initiative 02 — only count zoom dates
  // strictly AFTER the missed-zoom entry date (hs_v2_date_entered_28817239).
  const enrolled = deals.length;
  let meetings = 0, pipeline = 0, active = 0, terminated = 0;
  let cl_never = 0, cl_booked_no_pb = 0, cl_pb_no_place = 0, still_open = 0;

  const weekMap: Record<string, { enrolled: number; meetings: number }> = {};

  for (const deal of deals) {
    const entryDateStr = deal.properties[entryProperty];
    const entryDate = entryDateStr ? new Date(entryDateStr) : null;

    if (entryDate) {
      const week = getISOWeekLabel(entryDate);
      if (!weekMap[week]) weekMap[week] = { enrolled: 0, meetings: 0 };
      weekMap[week].enrolled++;
    }

    const hasZoom = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`];
    const zoomCounts = hasZoom && (
      !meetingAfterEntryOnly || !entryDateStr ||
      new Date(hasZoom) > new Date(entryDateStr)
    );
    if (zoomCounts) {
      meetings++;
      if (entryDate) {
        const week = getISOWeekLabel(new Date(hasZoom!));
        if (!weekMap[week]) weekMap[week] = { enrolled: 0, meetings: 0 };
        weekMap[week].meetings++;
      }
    }

    const pb = getPostBillingDate(deal);
    if (pb) pipeline++;

    const hasActive = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`];
    if (hasActive) active++;

    const hasTerm = deal.properties[`hs_v2_date_entered_${STAGE_IDS.TERMINATED}`];
    if (hasTerm) terminated++;

    const clType = classifyClosedLost(deal);
    if (clType === "cl_never_met")          cl_never++;
    else if (clType === "cl_booked_no_pipeline") cl_booked_no_pb++;
    else if (clType === "cl_pipeline_no_place")  cl_pb_no_place++;
    else still_open++;
  }

  const now = Date.now();
  const motionStart = new Date(motionDateFrom).getTime();
  const cohort_age_days = Math.floor((now - motionStart) / (1000 * 60 * 60 * 24));

  const weekly = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, data]) => ({ week, ...data }));

  return {
    enrolled,
    meetings_booked: meetings,
    pipeline_entered: pipeline,
    active_client: active,
    terminated,
    cl_never_met: cl_never,
    cl_booked_no_pipeline: cl_booked_no_pb,
    cl_pipeline_no_place: cl_pb_no_place,
    still_open,
    enroll_to_meeting_pct: enrolled > 0 ? round((meetings / enrolled) * 100) : 0,
    enroll_to_pipeline_pct: enrolled > 0 ? round((pipeline / enrolled) * 100) : 0,
    enroll_to_active_pct: enrolled > 0 ? round((active / enrolled) * 100) : 0,
    cl_no_meeting_pct: enrolled > 0 ? round((cl_never / enrolled) * 100) : 0,
    cohort_age_days,
    is_mature: cohort_age_days >= maturityDays,
    maturity_threshold_days: maturityDays,
    weekly,
  };
}

function round(n: number) { return Math.round(n * 10) / 10; }

function getISOWeekLabel(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ── fetchInitiativeData ───────────────────────────────────────────────────────

export async function fetchInitiativeData(
  token: string,
  initiativeId: string,
  entryProperty: string,
  oldFrom: string,
  oldTo: string,
  newFrom: string,
  maturityDays: number,
  newTo?: string,
  meetingAfterEntryOnly?: boolean
): Promise<{ old: MotionMetrics; new: MotionMetrics }> {
  const exclusionFilter = getExclusionFilter();

  // Fix 1: build prior-placement map once before fetching cohorts
  const priorMap = await buildPriorPlacementMap(token, exclusionFilter);
  await sleep(PAGE_DELAY_MS);

  const baseFilters = [
    { propertyName: "pipeline", operator: "EQ", value: "default" },
    ...exclusionFilter,
  ];

  console.log(`[hubspot] Initiative ${initiativeId}: old BETWEEN ${oldFrom} – ${toEndOfDay(oldTo)}, new ${newFrom}${newTo ? ` – ${toEndOfDay(newTo)}` : "+"}`);

  const oldDeals = (await fetchAllDeals(token, {
    filterGroups: [
      {
        filters: [
          { propertyName: entryProperty, operator: "BETWEEN", value: oldFrom, highValue: toEndOfDay(oldTo) },
          ...baseFilters,
        ],
      },
    ],
    properties: DEAL_PROPERTIES,
    associations: ["contacts"],
    limit: 200,
  })).filter((d) => isNewLead(d, priorMap));
  console.log(`[hubspot] Initiative ${initiativeId}: old cohort ${oldDeals.length} new-lead deals`);
  await sleep(PAGE_DELAY_MS);

  const newMotionDateFilter = newTo
    ? { propertyName: entryProperty, operator: "BETWEEN", value: newFrom, highValue: toEndOfDay(newTo) }
    : { propertyName: entryProperty, operator: "GTE", value: newFrom };

  const newDeals = (await fetchAllDeals(token, {
    filterGroups: [
      {
        filters: [newMotionDateFilter, ...baseFilters],
      },
    ],
    properties: DEAL_PROPERTIES,
    associations: ["contacts"],
    limit: 200,
  })).filter((d) => isNewLead(d, priorMap));
  console.log(`[hubspot] Initiative ${initiativeId}: new cohort ${newDeals.length} new-lead deals`);

  return {
    old: aggregateDeals(oldDeals, entryProperty, maturityDays, oldFrom, meetingAfterEntryOnly),
    new: aggregateDeals(newDeals, entryProperty, maturityDays, newFrom, meetingAfterEntryOnly),
  };
}

// ── HolisticMonthData ─────────────────────────────────────────────────────────

export interface HolisticMonthData {
  // Sales Funnel view (cohort: anchored on lead-entry date, pipeline=default, new leads only)
  lead: number;
  enrolled_in_seq: number;
  zoom_booked: number;
  pipeline_entered: number;
  recruiting: number;
  resumes_sent: number;
  interview_scheduled: number;
  agreement_sent: number;
  active_client: number;
  closed_lost_total: number;
  cl_never_met: number;
  cl_booked_no_place: number;
  // per-stage CL counts for Pipeline Leak Analysis
  cl_from_lead: number;
  cl_from_enrolled: number;
  cl_from_zoom: number;
  cl_from_pipeline: number;
  cl_from_recruiting: number;
  cl_from_resumes: number;
  cl_from_interview: number;
  cl_from_agreement: number;
  cl_from_active: number;
  // Sales Pipeline view (activity-based: each metric anchored on its own date, all pipelines, new leads only)
  sp_zoom_booked: number;
  sp_closed_won: number;
  sp_active_pipeline: number;
  sp_active_client: number;
  sp_closed_lost: number;
}

// ── fetchHolisticFunnel ───────────────────────────────────────────────────────

export async function fetchHolisticFunnel(
  token: string,
  monthsBack = 6
): Promise<Record<string, HolisticMonthData>> {
  const now = new Date();
  const results: Record<string, HolisticMonthData> = {};
  const exclusionFilter = getExclusionFilter();

  // NOTE: buildPriorPlacementMap is intentionally NOT called here.
  // The holistic refresh runs 5 queries × 6 months = 30 HubSpot calls.
  // Adding the prior-placement pre-query + associations overhead on every
  // deal pushes the total past Railway's 60 s maxDuration. The new-leads
  // filter is applied in fetchInitiativeData (per-initiative, smaller scope).

  const baseFilters = [
    { propertyName: "pipeline", operator: "EQ", value: "default" },
    ...exclusionFilter,
  ];

  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year  = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const from  = `${year}-${month}-01`;
    const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
    const to    = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    const toFull = toEndOfDay(to);
    const key   = `${year}-${month}`;

    console.log(`[holistic] ${key} | from=${from} | toFull=${toFull}`);

    // ── Query A: cohort (pipeline=default, lead entry in month) ──
    console.log(`[holistic] ${key} Query A — lead cohort BETWEEN ${from} AND ${toFull}`);
    const deals = await fetchAllDeals(token, {
      filterGroups: [
        {
          filters: [
            { propertyName: `hs_v2_date_entered_${STAGE_IDS.LEAD}`, operator: "BETWEEN", value: from, highValue: toFull },
            ...baseFilters,
          ],
        },
      ],
      properties: DEAL_PROPERTIES,
      limit: 200,
    });
    console.log(`[holistic] ${key} Query A: ${deals.length} deals`);
    await sleep(PAGE_DELAY_MS);

    // ── Query B: zoom booked in month, any pipeline ──
    console.log(`[holistic] ${key} Query B — sp_zoom BETWEEN ${from} AND ${toFull}`);
    const zoomDeals = await fetchAllDeals(token, {
      filterGroups: [{
        filters: [
          { propertyName: `hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`, operator: "BETWEEN", value: from, highValue: toFull },
          ...exclusionFilter,
        ],
      }],
      properties: DEAL_PROPERTIES,
      limit: 200,
    });
    console.log(`[holistic] ${key} Query B: ${zoomDeals.length} deals`);
    await sleep(PAGE_DELAY_MS);

    // ── Query C: any post-billing stage entered in month, any pipeline ──
    console.log(`[holistic] ${key} Query C — sp_closed_won BETWEEN ${from} AND ${toFull}`);
    const allPbDeals = await fetchAllDeals(token, {
      filterGroups: POST_BILLING_STAGES.map((stageId) => ({
        filters: [
          { propertyName: `hs_v2_date_entered_${stageId}`, operator: "BETWEEN", value: from, highValue: toFull },
          ...exclusionFilter,
        ],
      })),
      properties: DEAL_PROPERTIES,
      limit: 200,
    });
    const pbInMonthDeals = allPbDeals;
    console.log(`[holistic] ${key} Query C: ${pbInMonthDeals.length} deals`);
    await sleep(PAGE_DELAY_MS);

    // ── Query D: active client placed in month, any pipeline ──
    console.log(`[holistic] ${key} Query D — sp_active_client BETWEEN ${from} AND ${toFull}`);
    const activeDeals = await fetchAllDeals(token, {
      filterGroups: [{
        filters: [
          { propertyName: `hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`, operator: "BETWEEN", value: from, highValue: toFull },
          ...exclusionFilter,
        ],
      }],
      properties: DEAL_PROPERTIES,
      limit: 200,
    });
    console.log(`[holistic] ${key} Query D: ${activeDeals.length} deals`);
    await sleep(PAGE_DELAY_MS);

    // ── Query E: closed lost in month, any pipeline ──
    console.log(`[holistic] ${key} Query E — sp_closed_lost BETWEEN ${from} AND ${toFull}`);
    const clDeals = await fetchAllDeals(token, {
      filterGroups: [{
        filters: [
          { propertyName: `hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`, operator: "BETWEEN", value: from, highValue: toFull },
          ...exclusionFilter,
        ],
      }],
      properties: DEAL_PROPERTIES,
      limit: 200,
    });
    console.log(`[holistic] ${key} Query E: ${clDeals.length} deals`);
    await sleep(PAGE_DELAY_MS);

    // ── Aggregate cohort (Query A) ──
    let zoom = 0, enrolledInSeq = 0, pb = 0, recruiting = 0, resumesSent = 0;
    let interviewSched = 0, agreementSent = 0, active = 0;
    let cl_never = 0, cl_placed = 0, cl_total = 0;
    let cl_lead = 0, cl_enrolled = 0, cl_zoom = 0, cl_pb = 0;
    let cl_rec = 0, cl_res = 0, cl_int = 0, cl_agr = 0, cl_act = 0;

    for (const deal of deals) {
      const hasCL = !!(
        deal.properties[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`] ||
        deal.properties[`hs_v2_date_entered_${STAGE_IDS.DO_NOT_CONTACT}`]
      );

      const hasEnrolled = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ENROLLED_IN_SEQUENCE}`];
      const hasZoom     = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`];
      const pbDate      = getPostBillingDate(deal);
      const hasActive   = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`];
      const hasRec      = deal.properties[`hs_v2_date_entered_${STAGE_IDS.RECRUITING}`];
      const hasRes      = deal.properties[`hs_v2_date_entered_${STAGE_IDS.RESUMES_SENT}`];
      const hasInt      = deal.properties[`hs_v2_date_entered_${STAGE_IDS.INTERVIEW_SCHEDULED}`];
      const hasAgr      = deal.properties[`hs_v2_date_entered_${STAGE_IDS.AGREEMENT_SENT}`];

      if (hasEnrolled) enrolledInSeq++;
      if (hasZoom) zoom++;
      if (pbDate) pb++;
      if (hasRec) recruiting++;
      if (hasRes) resumesSent++;
      if (hasInt) interviewSched++;
      if (hasAgr) agreementSent++;
      if (hasActive) active++;

      const clType = classifyClosedLost(deal);
      if (clType === "cl_never_met") cl_never++;
      else if (clType === "cl_booked_no_pipeline" || clType === "cl_pipeline_no_place") cl_placed++;

      if (hasCL) {
        cl_total++;
        cl_lead++;
        if (hasEnrolled) cl_enrolled++;
        if (hasZoom)     cl_zoom++;
        if (pbDate)      cl_pb++;
        if (hasRec)      cl_rec++;
        if (hasRes)      cl_res++;
        if (hasInt)      cl_int++;
        if (hasAgr)      cl_agr++;
        if (hasActive)   cl_act++;
      }
    }

    // ── Aggregate Sales Pipeline metrics (Queries B–E) ──
    const pbDedupe = new Map<string, HubSpotDeal>();
    for (const deal of pbInMonthDeals) pbDedupe.set(deal.id, deal);
    let sp_closed_won = 0, sp_active_pipeline = 0;
    for (const deal of pbDedupe.values()) {
      const pbMs = getPostBillingDate(deal);
      if (!pbMs) continue;
      const pbMonthKey = new Date(pbMs).toISOString().slice(0, 7);
      if (pbMonthKey !== key) continue;
      sp_closed_won++;
      const hasActive = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`];
      const hasCL     = deal.properties[`hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`] ||
                        deal.properties[`hs_v2_date_entered_${STAGE_IDS.DO_NOT_CONTACT}`];
      if (!hasActive && !hasCL) sp_active_pipeline++;
    }

    results[key] = {
      lead: deals.length,
      enrolled_in_seq: enrolledInSeq,
      zoom_booked: zoom,
      pipeline_entered: pb,
      recruiting,
      resumes_sent: resumesSent,
      interview_scheduled: interviewSched,
      agreement_sent: agreementSent,
      active_client: active,
      closed_lost_total: cl_total,
      cl_never_met: cl_never,
      cl_booked_no_place: cl_placed,
      cl_from_lead: cl_lead,
      cl_from_enrolled: cl_enrolled,
      cl_from_zoom: cl_zoom,
      cl_from_pipeline: cl_pb,
      cl_from_recruiting: cl_rec,
      cl_from_resumes: cl_res,
      cl_from_interview: cl_int,
      cl_from_agreement: cl_agr,
      cl_from_active: cl_act,
      sp_zoom_booked: zoomDeals.length,
      sp_closed_won,
      sp_active_pipeline,
      sp_active_client: activeDeals.length,
      sp_closed_lost: clDeals.length,
    };

    console.log(`[holistic] ${key} results: lead=${deals.length} zoom=${zoomDeals.length} sp_closed_won=${sp_closed_won} sp_active_client=${activeDeals.length} sp_closed_lost=${clDeals.length}`);
  }

  return results;
}
