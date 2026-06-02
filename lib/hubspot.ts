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

async function searchDeals(token: string, filterGroups: FilterGroup[]): Promise<Deal[]> {
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
      throw new Error(`HubSpot ${res.status} (page ${page}): ${text}`);
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

function exclusionFilter(): Filter[] {
  if (EXCLUDED_CONTACT_IDS.length === 0) return [];
  return [{ propertyName: "associations.contact", operator: "NOT_IN", values: EXCLUDED_CONTACT_IDS }];
}

// ── Generic stage-date fetch (default pipeline) ─────────────────────────────
// Fetches deals where a specific stage-entry date falls in 2026, default pipeline.
// This captures deals CREATED before 2026 that progressed through this stage in 2026.

async function fetchByStageDate(token: string, stageProp: string): Promise<Deal[]> {
  const months = monthsSince("2026-01");
  const byId = new Map<string, Deal>();

  for (const m of months) {
    const { from, to } = monthRange(m);
    const batch = await searchDeals(token, [
      {
        filters: [
          { propertyName: stageProp, operator: "GTE", value: from },
          { propertyName: stageProp, operator: "LTE", value: to },
          { propertyName: "pipeline", operator: "EQ", value: "default" },
          ...exclusionFilter(),
        ],
      },
    ]);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] ${stageProp} ${m}: ${batch.length} (total ${byId.size})`);
    await sleep(PAGE_DELAY_MS);
  }

  return Array.from(byId.values());
}

// ── Fetch 1: Default pipeline deals by createdate ─────────────────────────────

export async function fetchDefaultPipelineDeals(token: string): Promise<Deal[]> {
  const months = monthsSince("2026-01");
  const byId = new Map<string, Deal>();

  for (const m of months) {
    const { from, to } = monthRange(m);
    const batch = await searchDeals(token, [
      {
        filters: [
          { propertyName: "pipeline", operator: "EQ", value: "default" },
          { propertyName: "createdate", operator: "GTE", value: from },
          { propertyName: "createdate", operator: "LTE", value: to },
          ...exclusionFilter(),
        ],
      },
    ]);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] default createdate ${m}: ${batch.length} (total ${byId.size})`);
    await sleep(PAGE_DELAY_MS);
  }

  return Array.from(byId.values());
}

// ── Fetch 2: Active Client deals — ALL pipelines, by AC stage date ─────────────

export async function fetchActiveClientDeals(token: string): Promise<Deal[]> {
  const months = monthsSince("2026-01");
  const byId = new Map<string, Deal>();

  for (const m of months) {
    const { from, to } = monthRange(m);
    const batch = await searchDeals(token, [
      {
        filters: [
          { propertyName: `hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`, operator: "GTE", value: from },
          { propertyName: `hs_v2_date_entered_${STAGE_IDS.ACTIVE_CLIENT}`, operator: "LTE", value: to },
          ...exclusionFilter(),
        ],
      },
    ]);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] active client ${m}: ${batch.length} (total ${byId.size})`);
    await sleep(PAGE_DELAY_MS);
  }

  return Array.from(byId.values());
}

// ── Fetch 3: Parking Lot deals — default pipeline, by stage-entry date ─────────
// Fix: captures deals created BEFORE 2026 that entered Parking Lot in 2026.

export async function fetchParkingLotDeals(token: string): Promise<Deal[]> {
  return fetchByStageDate(token, `hs_v2_date_entered_${STAGE_IDS.PARKING_LOT}`);
}

// ── Fetch 4: Post-billing deals — default pipeline, by any post-billing date ───
// Fix: captures deals created BEFORE 2026 that advanced to recruiting/etc. in 2026.
// filterGroups are OR'd → returns deals where ANY of the four stages was entered.

export async function fetchPostBillingDeals(token: string): Promise<Deal[]> {
  const months = monthsSince("2026-01");
  const byId = new Map<string, Deal>();

  const pbProps = [
    `hs_v2_date_entered_${STAGE_IDS.RECRUITING}`,
    `hs_v2_date_entered_${STAGE_IDS.RESUMES_SENT}`,
    `hs_v2_date_entered_${STAGE_IDS.INTERVIEW_SCHED}`,
    `hs_v2_date_entered_${STAGE_IDS.AGREEMENT_SENT}`,
  ];

  for (const m of months) {
    const { from, to } = monthRange(m);
    const filterGroups: FilterGroup[] = pbProps.map((prop) => ({
      filters: [
        { propertyName: prop, operator: "GTE", value: from },
        { propertyName: prop, operator: "LTE", value: to },
        { propertyName: "pipeline", operator: "EQ", value: "default" },
        ...exclusionFilter(),
      ],
    }));

    const batch = await searchDeals(token, filterGroups);
    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] post-billing ${m}: ${batch.length} (total ${byId.size})`);
    await sleep(PAGE_DELAY_MS);
  }

  return Array.from(byId.values());
}

// ── Merge helpers ──────────────────────────────────────────────────────────────

/** Merge multiple deal arrays, deduplicating by ID. First occurrence wins. */
export function mergeDeals(...arrays: Deal[][]): Deal[] {
  const byId = new Map<string, Deal>();
  for (const arr of arrays) {
    for (const d of arr) {
      if (!byId.has(d.id)) byId.set(d.id, d);
    }
  }
  return Array.from(byId.values());
}
