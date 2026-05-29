import { EXCLUDED_CONTACTS } from "@/config/exclusions";
import { POST_BILLING_STAGES, STAGE_IDS } from "@/config/initiatives";

const HUBSPOT_BASE = "https://api.hubspot.com/crm/v3/objects/deals/search";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const PAGE_DELAY_MS = 250; // stay well within HubSpot's secondly rate limit

interface HubSpotDeal {
  id: string;
  properties: Record<string, string | null>;
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

  const hasZoom = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`];
  const hasPB = getPostBillingDate(deal);
  const hasActive = deal.properties[`hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`];

  if (!hasZoom) return "cl_never_met";
  if (!hasPB) return "cl_booked_no_pipeline";
  if (!hasActive) return "cl_pipeline_no_place";
  return "cl_pipeline_no_place";
}

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
  const enrolled = deals.length;
  let meetings = 0;
  let pipeline = 0;
  let active = 0;
  let terminated = 0;
  let cl_never = 0;
  let cl_booked_no_pb = 0;
  let cl_pb_no_place = 0;
  let still_open = 0;

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
    const zoomCounts = hasZoom && (!meetingAfterEntryOnly || !entryDateStr ||
      new Date(hasZoom) > new Date(entryDateStr));
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
    if (clType === "cl_never_met") cl_never++;
    else if (clType === "cl_booked_no_pipeline") cl_booked_no_pb++;
    else if (clType === "cl_pipeline_no_place") cl_pb_no_place++;
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

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function getISOWeekLabel(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export async function fetchInitiativeData(
  token: string,
  initiativeId: string,
  entryProperty: string,
  oldFrom: string,
  oldTo: string,
  newFrom: string,
  maturityDays: number,
  newTo?: string, // optional — supplied when a period filter caps the new motion window
  meetingAfterEntryOnly?: boolean
): Promise<{ old: MotionMetrics; new: MotionMetrics }> {
  const exclusionFilter = getExclusionFilter();

  const baseFilters = [
    { propertyName: "pipeline", operator: "EQ", value: "default" },
    ...exclusionFilter,
  ];

  // Sequential (not concurrent) to avoid bursting the secondly rate limit
  const oldDeals = await fetchAllDeals(token, {
    filterGroups: [
      {
        filters: [
          { propertyName: entryProperty, operator: "BETWEEN", value: oldFrom, highValue: oldTo },
          ...baseFilters,
        ],
      },
    ],
    properties: DEAL_PROPERTIES,
    limit: 200,
  });
  await sleep(PAGE_DELAY_MS);

  // New motion: open-ended GTE for "all data", BETWEEN when a period cap is supplied
  const newMotionDateFilter = newTo
    ? { propertyName: entryProperty, operator: "BETWEEN", value: newFrom, highValue: newTo }
    : { propertyName: entryProperty, operator: "GTE", value: newFrom };

  const newDeals = await fetchAllDeals(token, {
    filterGroups: [
      {
        filters: [newMotionDateFilter, ...baseFilters],
      },
    ],
    properties: DEAL_PROPERTIES,
    limit: 200,
  });

  return {
    old: aggregateDeals(oldDeals, entryProperty, maturityDays, oldFrom, meetingAfterEntryOnly),
    new: aggregateDeals(newDeals, entryProperty, maturityDays, newFrom, meetingAfterEntryOnly),
  };
}

export interface HolisticMonthData {
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
}

export async function fetchHolisticFunnel(
  token: string,
  monthsBack = 6
): Promise<Record<string, HolisticMonthData>> {
  const now = new Date();
  const results: Record<string, HolisticMonthData> = {};

  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const from = `${year}-${month}-01`;
    const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
    const to = `${year}-${month}-${lastDay}`;
    const key = `${year}-${month}`;

    const exclusionFilter = getExclusionFilter();
    const baseFilters = [
      { propertyName: "pipeline", operator: "EQ", value: "default" },
      ...exclusionFilter,
    ];

    const deals = await fetchAllDeals(token, {
      filterGroups: [
        {
          filters: [
            {
              propertyName: `hs_v2_date_entered_${STAGE_IDS.LEAD}`,
              operator: "BETWEEN",
              value: from,
              highValue: to,
            },
            ...baseFilters,
          ],
        },
      ],
      properties: DEAL_PROPERTIES,
      limit: 200,
    });

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
    };
  }

  return results;
}
