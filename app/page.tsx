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
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load whatever is in the server cache on mount
  const loadCache = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      if (res.ok) {
        const data: CacheData = await res.json();
        setCacheData(data);
        setLastRefreshed(data.refreshed_at);
      }
    } catch {
      // Cache miss is fine — user just hasn't refreshed yet
    }
  }, []);

  useEffect(() => {
    loadCache();
  }, [loadCache]);

  const handleRefresh = async () => {
    const initiative = INITIATIVES.find((i) => i.id === activeTab)!;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/refresh?step=${activeTab}`, { method: "POST" });

      // Always try to parse the body — even error responses should be JSON
      let json: Record<string, unknown> = {};
      try {
        json = await res.json();
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status}). Check Railway logs.`);
      }

      if (!res.ok) {
        throw new Error((json.error as string) ?? `HTTP ${res.status}`);
      }

      // Use data from response body directly (works even if Railway filesystem write failed)
      if (json.data) {
        setCacheData((prev) => ({
          refreshed_at: new Date().toISOString(),
          initiatives: { ...(prev?.initiatives ?? {}), [activeTab]: json.data as CacheData["initiatives"][string] },
          holistic: prev?.holistic ?? {},
        }));
        setLastRefreshed(new Date().toISOString());

        if (json.cache_written === false) {
          setErrorMsg("⚠️ Data loaded but could not be saved to cache (Railway filesystem). Data will reset on next page load. Check Railway logs.");
        }
      } else {
        // Fallback: try reading from cache endpoint
        await loadCache();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setErrorMsg(`Refresh failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const initiativeData = cacheData?.initiatives?.[activeTab];
  const initiative = INITIATIVES.find((i) => i.id === activeTab)!;
  const old = initiativeData?.old ?? emptyMetrics(initiative.newMotion.maturityDays);
  const newData = initiativeData?.new ?? emptyMetrics(initiative.newMotion.maturityDays);
  const holistic: Record<string, HolisticMonthData> = cacheData?.holistic ?? {};

  const hasData = !!initiativeData;
  const refreshedAt = lastRefreshed
    ? new Date(lastRefreshed).toLocaleString("en-AU", { timeZone: "Asia/Singapore" }) + " SGT"
    : null;

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
            {loading ? "⟳ Refreshing…" : `↻ Refresh Initiative ${activeTab}`}
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
        <div className={`dot ${loading ? "loading" : hasData ? "" : "error"}`} />
        <span style={{ color: "var(--muted)" }}>
          {loading
            ? `Fetching Initiative ${activeTab} from HubSpot…`
            : hasData
            ? `Initiative ${activeTab} loaded${refreshedAt ? ` · ${refreshedAt}` : ""}`
            : "No data for this tab — click Refresh to load from HubSpot."}
        </span>
      </div>

      {/* Error banner — prominent, dismissible */}
      {errorMsg && (
        <div className="banner" style={{ background: "var(--dangerl)", borderColor: "#fca5a5", color: "#991b1b", marginBottom: 12 }}>
          <span className="bicon">⚠</span>
          <div style={{ flex: 1 }}>
            <strong>Error</strong><br />
            {errorMsg}
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontSize: 16, padding: "0 4px", alignSelf: "flex-start" }}
          >
            ✕
          </button>
        </div>
      )}

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
