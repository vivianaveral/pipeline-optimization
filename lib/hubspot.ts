import type { Deal } from "./types";
import { DEAL_PROPERTIES, EXCLUDED_CONTACT_IDS } from "./stages";

const HS_SEARCH_URL = "https://api.hubspot.com/crm/v3/objects/deals/search";
const PAGE_SIZE = 200;
const PAGE_DELAY_MS = 300; // polite delay between pages

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
    const body: SearchBody = {
      filterGroups,
      properties: DEAL_PROPERTIES,
      limit: PAGE_SIZE,
    };
    if (after) body.after = after;

    const res = await fetch(HS_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot ${res.status} (page ${page}): ${text}`);
    }

    const data = await res.json();
    const batch: Deal[] = (data.results ?? []).map((r: { id: string; properties: Record<string, string | null> }) => ({
      id: r.id,
      properties: r.properties as Deal["properties"],
    }));
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

/** Returns "YYYY-MM" strings from 2026-01 through current month (inclusive). */
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

// ── Exclusion filter ───────────────────────────────────────────────────────────

function exclusionFilter(): Filter[] {
  if (EXCLUDED_CONTACT_IDS.length === 0) return [];
  return [{ propertyName: "associations.contact", operator: "NOT_IN", values: EXCLUDED_CONTACT_IDS }];
}

// ── Main fetch: default pipeline deals, createdate >= 2026-01-01 ───────────────
// Split by createdate month to stay under HubSpot's 10,000-result search limit.

export async function fetchDefaultPipelineDeals(token: string): Promise<Deal[]> {
  const months = monthsSince("2026-01");
  const byId = new Map<string, Deal>();

  for (const m of months) {
    const { from, to } = monthRange(m);
    console.log(`[hs] default pipeline createdate ${m}: fetching...`);

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
    console.log(`[hs] default pipeline ${m}: ${batch.length} deals (total so far: ${byId.size})`);

    await sleep(PAGE_DELAY_MS);
  }

  return Array.from(byId.values());
}

// ── Active Client fetch: ALL pipelines, hs_v2_date_entered_12751919 in range ───
// Split by active-client entry month.

export async function fetchActiveClientDeals(token: string): Promise<Deal[]> {
  const months = monthsSince("2026-01");
  const byId = new Map<string, Deal>();

  for (const m of months) {
    const { from, to } = monthRange(m);
    console.log(`[hs] active client month ${m}: fetching...`);

    const batch = await searchDeals(token, [
      {
        filters: [
          { propertyName: "hs_v2_date_entered_12751919", operator: "GTE", value: from },
          { propertyName: "hs_v2_date_entered_12751919", operator: "LTE", value: to },
          ...exclusionFilter(),
        ],
      },
    ]);

    for (const d of batch) byId.set(d.id, d);
    console.log(`[hs] active client ${m}: ${batch.length} deals (total so far: ${byId.size})`);

    await sleep(PAGE_DELAY_MS);
  }

  return Array.from(byId.values());
}

// ── Merge: combine both sets, default-pipeline deals take precedence ───────────

export function mergeDeals(defaultDeals: Deal[], activeClientDeals: Deal[]): Deal[] {
  const byId = new Map<string, Deal>();
  // Default pipeline deals first
  for (const d of defaultDeals) byId.set(d.id, d);
  // Active client deals — add only if not already present (preserve default pipeline data)
  for (const d of activeClientDeals) {
    if (!byId.has(d.id)) byId.set(d.id, d);
  }
  return Array.from(byId.values());
}
