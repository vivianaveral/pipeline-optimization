import { NextResponse } from "next/server";
import { INITIATIVES } from "@/config/initiatives";
import { fetchInitiativeData, fetchHolisticFunnel } from "@/lib/hubspot";
import { writeCache, type CacheData } from "@/lib/cache";

export async function POST() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HUBSPOT_ACCESS_TOKEN not set" }, { status: 500 });
  }

  try {
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

      const oldTo = initiative.oldMotion.dateTo && initiative.oldMotion.dateTo !== "TBD"
        ? initiative.oldMotion.dateTo
        : new Date().toISOString().split("T")[0];

      const newFrom = initiative.newMotion.dateFrom !== "TBD"
        ? initiative.newMotion.dateFrom
        : new Date().toISOString().split("T")[0];

      const data = await fetchInitiativeData(
        token,
        initiative.id,
        entryProperty,
        initiative.oldMotion.dateFrom,
        oldTo,
        newFrom,
        initiative.newMotion.maturityDays ?? 42
      );

      initiativeResults[initiative.id] = data;
    }

    const holistic = await fetchHolisticFunnel(token, 6);

    const cache: CacheData = {
      refreshed_at: new Date().toISOString(),
      initiatives: initiativeResults,
      holistic,
    };

    writeCache(cache);

    return NextResponse.json({ ok: true, refreshed_at: cache.refreshed_at });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST to refresh" }, { status: 405 });
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
