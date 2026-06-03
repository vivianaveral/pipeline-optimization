import type { Deal } from "./types";
import { DEAL_PROPERTIES, EXCLUDED_CONTACT_IDS, STAGE_IDS } from "./stages";

const HS_SEARCH_URL = "https://api.hubspot.com/crm/v3/objects/deals/search";
const PAGE_SIZE = 200;
const PAGE_DELAY_MS = 300;

type Filter = {
  propertyName: string;
  operator: string;
  value?: string;
  highValue?: string;
  values?: string[];
};

type FilterGroup = { filters: Filter[] };

interface SearchBody {
  filterGroups: FilterGroup[];
  properties: string[];
  limit: number;
  after?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Core paginator ─────────────────────────────────────────────────────────────

async function searchDeals(
  token: string,
  filterGroups: FilterGroup[],
  label: string
): Promise<Deal[]> {
  // Log exact filters before every request so we can verify correctness
  console.log(`[hs:filter] ${label} → ${JSON.stringify(filterGroups)}`);

  const results: Deal[] = [];
  let after: string | undefined;
  let page = 0;

  do {
    page++;
    const body: SearchBody = { filterGroups, properties: DEAL_PROPERTIES, limit: PAGE_SIZE };
    if (after) body.after = after;

    const res = await fetch(HS_SEARCH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot ${res.status} [${label} p${page}]: ${text}`);
    }

    const data = await res.json();
    const batch: Deal[] = (data.results ?? []).map(
      (r: { id: string; properties: Record<string, string | null> }) => ({
        id: r.id,
        properties: r.properties as Deal["properties"],
      })
    );
    results.push(...batch);

    after = data.paging?.next?.after;
    if (after) await sleep(PAGE_DELAY_MS);
  } while (after);

  return results;
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function monthRange(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${yearMonth}-01`,
    to: `${yearMonth}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`,
  };
}

export function monthsSince(fromYYYYMM: string): string[] {
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

function exclusionFilter(): Filter[] {
  if (EXCLUDED_CONTACT_IDS.length === 0) return [];
  return [{ propertyName: "associations.contact", operator: "NOT_IN", values: EXCLUDED_CONTACT_IDS }];
}

// ── Fetch 1a: Calls Booked — exact Query 1 ────────────────────────────────────
// stage date IN month, pipeline=default, HAS_PROPERTY appointmentscheduled
// Confirmed May 2026 total = 1,875.

export async function fetchCallsBookedDeals(token: string): Promise<Deal[]> {
  const byId = new Map<string, Deal>();
  for (const m of monthsSince("2026-01")) {
    const { from, to } = monthRange(m);
    const fg: FilterGroup[] = [{
      filters: [
        { propertyName: `hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`, operator: "GTE", value: from },
        { propertyName: `hs_v2_date_entered_${STAGE_IDS.ZOOM_CALL_BOOKED}`, operator: "LTE", value: to },
        { propertyName: "pipeline", operator: "EQ", value: "default" },
        { propertyName: "hs_v2_date_entered_appointmentscheduled", operator: "HAS_PROPERTY" },
        ...exclusionFilter(),
      ],
    }];
    const batch = await searchDeals(token, fg, `calls_booked_${m}`);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] calls_booked ${m}: ${batch.length} → total ${byId.size}`);
    await sleep(PAGE_DELAY_MS);
  }
  return Array.from(byId.values());
}

// ── Fetch 1b: No-shows — exact Query 2 ────────────────────────────────────────
// stage date IN month, pipeline=default, HAS_PROPERTY appointmentscheduled
// Confirmed May 2026 total = 701. Attended = 1,875 − 701 = 1,174.

export async function fetchNoShowDeals(token: string): Promise<Deal[]> {
  const byId = new Map<string, Deal>();
  for (const m of monthsSince("2026-01")) {
    const { from, to } = monthRange(m);
    const fg: FilterGroup[] = [{
      filters: [
        { propertyName: `hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`, operator: "GTE", value: from },
        { propertyName: `hs_v2_date_entered_${STAGE_IDS.MISSED_ZOOM_CALL}`, operator: "LTE", value: to },
        { propertyName: "pipeline", operator: "EQ", value: "default" },
        { propertyName: "hs_v2_date_entered_appointmentscheduled", operator: "HAS_PROPERTY" },
        ...exclusionFilter(),
      ],
    }];
    const batch = await searchDeals(token, fg, `no_shows_${m}`);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] no_shows ${m}: ${batch.length} → total ${byId.size}`);
    await sleep(PAGE_DELAY_MS);
  }
  return Array.from(byId.values());
}

// ── Fetch 2: Default pipeline deals by createdate ──────────────────────────────
// Handles: billing entered, cohort analysis, billing breakdown, post-billing sub-stages.
// callsBooked and noShows now have their own dedicated fetches above.

export async function fetchDefaultPipelineDeals(token: string): Promise<Deal[]> {
  const byId = new Map<string, Deal>();
  for (const m of monthsSince("2026-01")) {
    const { from, to } = monthRange(m);
    const fg: FilterGroup[] = [{
      filters: [
        { propertyName: "pipeline", operator: "EQ", value: "default" },
        { propertyName: "createdate", operator: "GTE", value: from },
        { propertyName: "createdate", operator: "LTE", value: to },
        ...exclusionFilter(),
      ],
    }];
    const batch = await searchDeals(token, fg, `default_createdate_${m}`);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] default_createdate ${m}: ${batch.length} → total ${byId.size}`);
    await sleep(PAGE_DELAY_MS);
  }
  return Array.from(byId.values());
}

// ── Fetch 2: Parking Lot deals — by stage-entry date, NO pipeline filter ────────
// FIX 1: Captures deals created BEFORE 2026 that entered parking lot in 2026.
// No pipeline filter — stage date is the only criterion, no createdate dependency.

export async function fetchParkingLotDeals(token: string): Promise<Deal[]> {
  const byId = new Map<string, Deal>();
  for (const m of monthsSince("2026-01")) {
    const { from, to } = monthRange(m);
    const fg: FilterGroup[] = [{
      filters: [
        { propertyName: `hs_v2_date_entered_${STAGE_IDS.PARKING_LOT}`, operator: "GTE", value: from },
        { propertyName: `hs_v2_date_entered_${STAGE_IDS.PARKING_LOT}`, operator: "LTE", value: to },
        ...exclusionFilter(),
      ],
    }];
    const batch = await searchDeals(token, fg, `parking_lot_${m}`);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] parking_lot ${m}: ${batch.length} → total ${byId.size}`);
    await sleep(PAGE_DELAY_MS);
  }
  return Array.from(byId.values());
}

// ── Fetch 3: Closed Lost deals — by stage-entry date, pipeline=default ──────────
// FIX 3: Dedicated CL query with explicit pipeline filter applied at API level.
// Also requires HAS_PROPERTY appointmentscheduled to exclude non-sales-funnel deals.
// Deals are counted for the month their CL date falls in — not by createdate.

export async function fetchClosedLostDeals(token: string): Promise<Deal[]> {
  const byId = new Map<string, Deal>();
  for (const m of monthsSince("2026-01")) {
    const { from, to } = monthRange(m);
    const fg: FilterGroup[] = [{
      filters: [
        { propertyName: `hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`, operator: "GTE", value: from },
        { propertyName: `hs_v2_date_entered_${STAGE_IDS.CLOSED_LOST}`, operator: "LTE", value: to },
        { propertyName: "pipeline", operator: "EQ", value: "default" },        // default only
        { propertyName: "hs_v2_date_entered_appointmentscheduled", operator: "HAS_PROPERTY" }, // sales-funnel only
        ...exclusionFilter(),
      ],
    }];
    const batch = await searchDeals(token, fg, `closed_lost_${m}`);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] closed_lost ${m}: ${batch.length} → total ${byId.size}`);
    await sleep(PAGE_DELAY_MS);
  }
  return Array.from(byId.values());
}

// ── Fetch 4: Post-billing deals — exact Query 3 ───────────────────────────────
// One request per month, 4 filterGroups (OR logic). HubSpot returns unique deals
// that entered ANY of the 4 post-billing stages in that month.
// pipeline=default + HAS_PROPERTY appointmentscheduled match Query 3 exactly.
// Confirmed May 2026 total = 481 unique deals.

export async function fetchPostBillingDeals(token: string): Promise<Deal[]> {
  const stageIds = [
    STAGE_IDS.RECRUITING,
    STAGE_IDS.RESUMES_SENT,
    STAGE_IDS.INTERVIEW_SCHED,
    STAGE_IDS.AGREEMENT_SENT,
  ];

  const byId = new Map<string, Deal>();

  for (const m of monthsSince("2026-01")) {
    const { from, to } = monthRange(m);
    // One filterGroup per stage — HubSpot ORs across filterGroups, ANDs within each.
    // HAS_PROPERTY appointmentscheduled added to each group (matches Query 3 exactly).
    const fg: FilterGroup[] = stageIds.map((stageId) => ({
      filters: [
        { propertyName: `hs_v2_date_entered_${stageId}`, operator: "GTE", value: from },
        { propertyName: `hs_v2_date_entered_${stageId}`, operator: "LTE", value: to },
        { propertyName: "pipeline", operator: "EQ", value: "default" },
        { propertyName: "hs_v2_date_entered_appointmentscheduled", operator: "HAS_PROPERTY" },
        ...exclusionFilter(),
      ],
    }));
    const batch = await searchDeals(token, fg, `post_billing_or4_${m}`);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] post_billing ${m}: ${batch.length} unique → total ${byId.size}`);
    await sleep(PAGE_DELAY_MS);
  }

  console.log(`[hs] post_billing total unique: ${byId.size}`);
  return Array.from(byId.values());
}

// ── Fetch 5: Active Client deals — ALL pipelines, by stage-entry date ───────────
// No pipeline filter (by design — deals move to CS pipeline at this stage).
// HAS_PROPERTY appointmentscheduled excludes existing clients re-entering the pipeline.
// inMonth check in metrics ensures only the correct month is counted.

export async function fetchActiveClientDeals(token: string): Promise<Deal[]> {
  const byId = new Map<string, Deal>();
  for (const m of monthsSince("2026-01")) {
    const { from, to } = monthRange(m);
    const fg: FilterGroup[] = [{
      filters: [
        { propertyName: `hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`, operator: "GTE", value: from },
        { propertyName: `hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`, operator: "LTE", value: to },
        { propertyName: "hs_v2_date_entered_appointmentscheduled", operator: "HAS_PROPERTY" }, // exclude re-entering existing clients
        ...exclusionFilter(),
        // No pipeline filter — deals move from default to CS pipeline at this stage
      ],
    }];
    const batch = await searchDeals(token, fg, `active_client_${m}`);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] active_client ${m}: ${batch.length} → total ${byId.size}`);
    await sleep(PAGE_DELAY_MS);
  }
  return Array.from(byId.values());
}

// ── Merge ──────────────────────────────────────────────────────────────────────

/** Deduplicate by deal ID. First-seen wins. */
export function mergeDeals(...arrays: Deal[][]): Deal[] {
  const byId = new Map<string, Deal>();
  for (const arr of arrays) {
    for (const d of arr) {
      if (!byId.has(d.id)) byId.set(d.id, d);
    }
  }
  return Array.from(byId.values());
}
