"use client";
import { useState, useEffect, useCallback } from "react";
import { INITIATIVES } from "@/config/initiatives";
import type { CacheData } from "@/lib/cache";
import type { MotionMetrics, HolisticMonthData } from "@/lib/hubspot";
import ExclusionsPanel from "@/components/ExclusionsPanel";
import InitiativeView from "@/components/InitiativeView";

function emptyMetrics(maturityDays = 42): MotionMetrics {
  return {
    enrolled: 0, meetings_booked: 0, pipeline_entered: 0, active_client: 0,
    terminated: 0, cl_never_met: 0, cl_booked_no_pipeline: 0, cl_pipeline_no_place: 0,
    still_open: 0, enroll_to_meeting_pct: 0, enroll_to_pipeline_pct: 0,
    enroll_to_active_pct: 0, cl_no_meeting_pct: 0, cohort_age_days: 0,
    is_mature: false, maturity_threshold_days: maturityDays, weekly: [],
  };
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("01");
  const [cacheData, setCacheData] = useState<CacheData | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"ok" | "loading" | "error" | "empty">("empty");
  const [statusText, setStatusText] = useState("No data loaded. Click Refresh to pull from HubSpot (fetches one initiative at a time).");

  const loadCache = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      if (res.ok) {
        const data: CacheData = await res.json();
        setCacheData(data);
        setStatus("ok");
        const d = new Date(data.refreshed_at);
        setStatusText(`Last refreshed: ${d.toLocaleString("en-AU", { timeZone: "Asia/Singapore" })} SGT`);
      } else {
        setStatus("empty");
        setStatusText("No data yet. Click Refresh to pull from HubSpot.");
      }
    } catch {
      setStatus("error");
      setStatusText("Error loading cache.");
    }
  }, []);

  useEffect(() => {
    loadCache();
  }, [loadCache]);

  const handleRefresh = async () => {
    setLoading(true);
    const steps = [...INITIATIVES.map((i) => i.id), "holistic"] as const;
    const errors: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const label = step === "holistic" ? "Holistic funnel" : `Initiative ${step} / ${INITIATIVES.find((x) => x.id === step)?.name}`;
      setStatus("loading");
      setStatusText(`Refreshing ${i + 1}/${steps.length}: ${label}…`);

      try {
        const res = await fetch(`/api/refresh?step=${step}`, { method: "POST" });
        const json = await res.json();
        if (!res.ok) {
          const msg = json?.error ?? `HTTP ${res.status}`;
          console.error(`[refresh] Step ${step} failed:`, msg);
          errors.push(`${label}: ${msg}`);
          // Continue to next step — don't abort the whole refresh
        } else {
          // Reload cache after each successful step so data appears progressively
          await loadCache();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "network error";
        console.error(`[refresh] Step ${step} threw:`, e);
        errors.push(`${label}: ${msg}`);
      }
    }

    setLoading(false);
    if (errors.length === 0) {
      await loadCache();
    } else if (errors.length === steps.length) {
      setStatus("error");
      setStatusText(`All steps failed. First error: ${errors[0]}`);
    } else {
      // Partial success — show which steps failed
      setStatus("error");
      setStatusText(`Refresh complete with ${errors.length} error(s): ${errors.join(" · ")}`);
      await loadCache();
    }
  };

  const initiative = INITIATIVES.find((i) => i.id === activeTab)!;
  const initiativeData = cacheData?.initiatives?.[activeTab];
  const old = initiativeData?.old ?? emptyMetrics(initiative.newMotion.maturityDays);
  const newData = initiativeData?.new ?? emptyMetrics(initiative.newMotion.maturityDays);
  const holistic: Record<string, HolisticMonthData> = cacheData?.holistic ?? {};

  return (
    <div className="wrap">
      {/* Header */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>BruntWork · Internal</p>
            <h1>Sales Initiative KPI Tracker</h1>
          </div>
          <button className="btn primary" onClick={handleRefresh} disabled={loading}>
            {loading ? "⟳ Refreshing..." : "↻ Refresh from HubSpot"}
          </button>
        </div>

        {/* Nav tabs */}
        <div className="nav-tabs">
          {INITIATIVES.map((ini) => (
            <button
              key={ini.id}
              className={`nav-tab ${activeTab === ini.id ? "active" : ""}`}
              onClick={() => setActiveTab(ini.id)}
            >
              {ini.id}. {ini.name}
              {ini.notYetLaunched && (
                <span style={{ marginLeft: 5, fontSize: 9, opacity: 0.7 }}>BASELINE</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="status">
        <div className={`dot ${status === "loading" ? "loading" : status === "error" ? "error" : ""}`} />
        <span>{statusText}</span>
      </div>

      {/* Exclusions */}
      <ExclusionsPanel />

      {/* Initiative content */}
      <InitiativeView
        key={activeTab}
        initiative={initiative}
        old={old}
        newData={newData}
        holistic={holistic}
      />
    </div>
  );
}
