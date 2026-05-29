import { NextRequest, NextResponse } from "next/server";
import { INITIATIVES } from "@/config/initiatives";
import { fetchInitiativeData, fetchHolisticFunnel } from "@/lib/hubspot";
import { readCache, writeCache, type CacheData } from "@/lib/cache";

// Extend Railway/Next.js timeout to 60s per step
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HUBSPOT_ACCESS_TOKEN is not set in environment variables" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const step = searchParams.get("step"); // initiative ID ("01"–"05") or "holistic", or null = full refresh

  try {
    if (step === "holistic") {
      return await handleHolistic(token);
    }

    if (step) {
      return await handleInitiative(token, step);
    }

    // No step param — run everything sequentially (dev/testing convenience; Railway uses per-step calls)
    return await handleAll(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[refresh] Unhandled error (step=${step ?? "all"}):`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST to refresh" }, { status: 405 });
}

// ─── Per-step handlers ───────────────────────────────────────────────────────

async function handleInitiative(token: string, id: string) {
  const initiative = INITIATIVES.find((i) => i.id === id);
  if (!initiative) {
    return NextResponse.json({ error: `Unknown initiative id: ${id}` }, { status: 400 });
  }

  let result: CacheData["initiatives"][string];

  if (initiative.notYetLaunched) {
    result = {
      old: buildBaselineMetrics(initiative),
      new: buildEmptyMetrics(initiative.newMotion.maturityDays ?? 42),
    };
  } else {
    const entryProperty = initiative.entryProperty;
    if (!entryProperty) {
      return NextResponse.json({ error: `Initiative ${id} has no entryProperty configured` }, { status: 400 });
    }

    const oldTo =
      initiative.oldMotion.dateTo && initiative.oldMotion.dateTo !== "TBD"
        ? initiative.oldMotion.dateTo
        : new Date().toISOString().split("T")[0];

    const newFrom =
      initiative.newMotion.dateFrom !== "TBD"
        ? initiative.newMotion.dateFrom
        : new Date().toISOString().split("T")[0];

    console.log(`[refresh] Fetching initiative ${id}: old ${initiative.oldMotion.dateFrom}→${oldTo}, new ${newFrom}+`);

    try {
      result = await fetchInitiativeData(
        token,
        initiative.id,
        entryProperty,
        initiative.oldMotion.dateFrom,
        oldTo,
        newFrom,
        initiative.newMotion.maturityDays ?? 42
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[refresh] HubSpot error on initiative ${id}:`, err);
      return NextResponse.json({ error: `Initiative ${id} failed: ${message}` }, { status: 502 });
    }
  }

  // Merge into existing cache (don't wipe other initiatives)
  const existing = readCache() ?? emptyCache();
  existing.initiatives[id] = result;
  existing.refreshed_at = new Date().toISOString();
  writeCache(existing);

  console.log(`[refresh] Initiative ${id} done — enrolled old=${result.old.enrolled} new=${result.new.enrolled}`);
  return NextResponse.json({
    ok: true,
    step: id,
    enrolled_old: result.old.enrolled,
    enrolled_new: result.new.enrolled,
  });
}

async function handleHolistic(token: string) {
  console.log("[refresh] Fetching holistic funnel (6 months)...");

  let holistic: CacheData["holistic"];
  try {
    holistic = await fetchHolisticFunnel(token, 6);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[refresh] HubSpot error on holistic funnel:", err);
    return NextResponse.json({ error: `Holistic funnel failed: ${message}` }, { status: 502 });
  }

  const existing = readCache() ?? emptyCache();
  existing.holistic = holistic;
  existing.refreshed_at = new Date().toISOString();
  writeCache(existing);

  const monthCount = Object.keys(holistic).length;
  console.log(`[refresh] Holistic done — ${monthCount} months`);
  return NextResponse.json({ ok: true, step: "holistic", months: monthCount });
}

async function handleAll(token: string) {
  console.log("[refresh] Full refresh (all initiatives + holistic)...");
  const initiativeResults: CacheData["initiatives"] = {};

  for (const initiative of INITIATIVES) {
    if (initiative.notYetLaunched) {
      initiativeResults[initiative.id] = {
        old: buildBaselineMetrics(initiative),
        new: buildEmptyMetrics(initiative.newMotion.maturityDays ?? 42),
      };
      continue;
    }

    const entryProperty = initiative.entryProperty;
    if (!entryProperty) continue;

    const oldTo =
      initiative.oldMotion.dateTo && initiative.oldMotion.dateTo !== "TBD"
        ? initiative.oldMotion.dateTo
        : new Date().toISOString().split("T")[0];

    const newFrom =
      initiative.newMotion.dateFrom !== "TBD"
        ? initiative.newMotion.dateFrom
        : new Date().toISOString().split("T")[0];

    console.log(`[refresh] Fetching initiative ${initiative.id}...`);
    try {
      initiativeResults[initiative.id] = await fetchInitiativeData(
        token,
        initiative.id,
        entryProperty,
        initiative.oldMotion.dateFrom,
        oldTo,
        newFrom,
        initiative.newMotion.maturityDays ?? 42
      );
    } catch (err) {
      console.error(`[refresh] Initiative ${initiative.id} failed:`, err);
      throw err; // bubble up to outer handler
    }
  }

  console.log("[refresh] Fetching holistic funnel...");
  const holistic = await fetchHolisticFunnel(token, 6);

  const cache: CacheData = {
    refreshed_at: new Date().toISOString(),
    initiatives: initiativeResults,
    holistic,
  };
  writeCache(cache);

  console.log("[refresh] Full refresh complete");
  return NextResponse.json({ ok: true, refreshed_at: cache.refreshed_at });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyCache(): CacheData {
  return { refreshed_at: new Date().toISOString(), initiatives: {}, holistic: {} };
}

function buildEmptyMetrics(maturityDays: number) {
  return {
    enrolled: 0, meetings_booked: 0, pipeline_entered: 0, active_client: 0,
    terminated: 0, cl_never_met: 0, cl_booked_no_pipeline: 0, cl_pipeline_no_place: 0,
    still_open: 0, enroll_to_meeting_pct: 0, enroll_to_pipeline_pct: 0,
    enroll_to_active_pct: 0, cl_no_meeting_pct: 0, cohort_age_days: 0,
    is_mature: false, maturity_threshold_days: maturityDays, weekly: [],
  };
}

function buildBaselineMetrics(initiative: (typeof INITIATIVES)[number]) {
  if (initiative.id === "05" && initiative.baseline) {
    const b = initiative.baseline;
    return {
      enrolled: b.zoom_booked_april,
      meetings_booked: b.zoom_booked_april - b.missed_zoom_april,
      pipeline_entered: 0, active_client: 0, terminated: 0,
      cl_never_met: b.missed_zoom_april, cl_booked_no_pipeline: 0, cl_pipeline_no_place: 0,
      still_open: 0,
      enroll_to_meeting_pct: b.show_rate_proxy,
      enroll_to_pipeline_pct: 0, enroll_to_active_pct: 0,
      cl_no_meeting_pct: b.no_show_rate_proxy,
      cohort_age_days: 60, is_mature: true,
      maturity_threshold_days: initiative.newMotion.maturityDays ?? 14,
      weekly: [],
    };
  }
  return buildEmptyMetrics(initiative.newMotion.maturityDays ?? 42);
}
