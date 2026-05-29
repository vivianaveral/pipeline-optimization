"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { INITIATIVES, type Initiative } from "@/config/initiatives";
import type { CacheData } from "@/lib/cache";
import type { MotionMetrics, HolisticMonthData } from "@/lib/hubspot";
import ExclusionsPanel from "@/components/ExclusionsPanel";
import InitiativeView from "@/components/InitiativeView";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "all" | "this_month" | "last_month" | "this_q" | "last_q" | "custom";

interface PeriodDates { from: string; to: string }

interface EffectiveDates {
  oldFrom: string; oldTo: string;
  newFrom: string; newTo?: string; // undefined = open-ended (all data)
}

// ─── AU FY quarter helpers ────────────────────────────────────────────────────
// Q1: Jul–Sep  Q2: Oct–Dec  Q3: Jan–Mar  Q4: Apr–Jun

function toDateStr(d: Date) { return d.toISOString().split("T")[0]; }

function getAUFYQuarter(d: Date): { start: Date; end: Date } {
  const m = d.getMonth(); const y = d.getFullYear();
  if (m >= 6 && m <= 8)  return { start: new Date(y, 6,  1), end: new Date(y,  8, 30) };
  if (m >= 9 && m <= 11) return { start: new Date(y, 9,  1), end: new Date(y, 11, 31) };
  if (m >= 0 && m <= 2)  return { start: new Date(y, 0,  1), end: new Date(y,  2, 31) };
                          return { start: new Date(y, 3,  1), end: new Date(y,  5, 30) };
}

function getLastAUFYQuarter(d: Date): { start: Date; end: Date } {
  const curr = getAUFYQuarter(d);
  const prev = new Date(curr.start); prev.setDate(prev.getDate() - 1);
  return getAUFYQuarter(prev);
}

function getPeriodDates(period: Period, customFrom: string, customTo: string): PeriodDates | null {
  const today = new Date();
  const todayStr = toDateStr(today);
  if (period === "all") return null;
  if (period === "this_month") {
    return { from: toDateStr(new Date(today.getFullYear(), today.getMonth(), 1)), to: todayStr };
  }
  if (period === "last_month") {
    return {
      from: toDateStr(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to:   toDateStr(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  if (period === "this_q") {
    const q = getAUFYQuarter(today);
    return { from: toDateStr(q.start), to: todayStr };
  }
  if (period === "last_q") {
    const q = getLastAUFYQuarter(today);
    return { from: toDateStr(q.start), to: toDateStr(q.end) };
  }
  if (period === "custom" && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }
  return null;
}

// Intersect period window with initiative config dates to get what we actually query
function getEffectiveDates(ini: Initiative, period: PeriodDates | null): EffectiveDates | null {
  const today = toDateStr(new Date());
  const configOldFrom = ini.oldMotion.dateFrom;
  const configOldTo = ini.oldMotion.dateTo && ini.oldMotion.dateTo !== "TBD" ? ini.oldMotion.dateTo : today;
  const configNewFrom = ini.newMotion.dateFrom !== "TBD" ? ini.newMotion.dateFrom : today;

  if (!period) {
    // All data — no overrides; API uses config defaults
    return null;
  }

  return {
    oldFrom: period.from > configOldFrom ? period.from : configOldFrom,
    oldTo:   period.to   < configOldTo   ? period.to   : configOldTo,
    newFrom: period.from > configNewFrom  ? period.from : configNewFrom,
    newTo:   period.to, // always cap new motion when a period is active
  };
}

// ─── Empty metric shape ───────────────────────────────────────────────────────

function emptyMetrics(maturityDays = 42): MotionMetrics {
  return {
    enrolled: 0, meetings_booked: 0, pipeline_entered: 0, active_client: 0,
    terminated: 0, cl_never_met: 0, cl_booked_no_pipeline: 0, cl_pipeline_no_place: 0,
    still_open: 0, enroll_to_meeting_pct: 0, enroll_to_pipeline_pct: 0,
    enroll_to_active_pct: 0, cl_no_meeting_pct: 0, cohort_age_days: 0,
    is_mature: false, maturity_threshold_days: maturityDays, weekly: [],
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HomePage() {
  const [activeTab, setActiveTab]     = useState("01");
  const [cacheData, setCacheData]     = useState<CacheData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);

  // Period filter state
  const [period, setPeriod]         = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");

  // Ref to suppress the auto-fetch on mount (only fire on subsequent period changes)
  const periodInitRef = useRef(false);

  // Load server cache on mount
  const loadCache = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      if (res.ok) {
        const data: CacheData = await res.json();
        setCacheData(data);
        setLastRefreshed(data.refreshed_at);
      }
    } catch { /* cache miss is fine */ }
  }, []);

  useEffect(() => { loadCache(); }, [loadCache]);

  // ─── Core fetch helpers ────────────────────────────────────────────────────

  const fetchInitiative = useCallback(async (tabId: string, effectiveDates: EffectiveDates | null) => {
    const url = new URL(`/api/refresh`, window.location.origin);
    url.searchParams.set("step", tabId);
    if (effectiveDates) {
      url.searchParams.set("oldFrom", effectiveDates.oldFrom);
      url.searchParams.set("oldTo",   effectiveDates.oldTo);
      url.searchParams.set("newFrom", effectiveDates.newFrom);
      if (effectiveDates.newTo) url.searchParams.set("newTo", effectiveDates.newTo);
    }

    const res = await fetch(url.toString(), { method: "POST" });
    let json: Record<string, unknown> = {};
    try { json = await res.json(); } catch {
      throw new Error(`Non-JSON response (HTTP ${res.status}) — check Railway logs.`);
    }
    if (!res.ok) throw new Error((json.error as string) ?? `HTTP ${res.status}`);
    return json;
  }, []);

  const fetchHolistic = useCallback(async () => {
    const res = await fetch("/api/refresh?step=holistic", { method: "POST" });
    let json: Record<string, unknown> = {};
    try { json = await res.json(); } catch { return; }
    if (res.ok && json.data) {
      setCacheData((prev) => ({
        refreshed_at: new Date().toISOString(),
        initiatives: prev?.initiatives ?? {},
        holistic: json.data as Record<string, HolisticMonthData>,
      }));
    }
  }, []);

  // ─── Refresh handler ───────────────────────────────────────────────────────

  const handleRefresh = useCallback(async (tabId = activeTab, overridePeriod?: Period) => {
    const ini = INITIATIVES.find((i) => i.id === tabId)!;
    const activePeriod = overridePeriod ?? period;
    const periodDates = getPeriodDates(activePeriod, customFrom, customTo);
    const effective = getEffectiveDates(ini, periodDates);

    setLoading(true);
    setErrorMsg(null);

    try {
      const json = await fetchInitiative(tabId, effective);

      if (json.data) {
        setCacheData((prev) => ({
          refreshed_at: new Date().toISOString(),
          initiatives: { ...(prev?.initiatives ?? {}), [tabId]: json.data as CacheData["initiatives"][string] },
          holistic: prev?.holistic ?? {},
        }));
        setLastRefreshed(new Date().toISOString());

        if (json.cache_written === false) {
          setErrorMsg("Data loaded but cache write failed on the server — data will reset on next page load. Check Railway logs.");
        }

        // Auto-fetch holistic after every initiative refresh (fire-and-forget)
        fetchHolistic().catch(console.error);
      } else {
        await loadCache();
      }
    } catch (e) {
      setErrorMsg(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, period, customFrom, customTo, fetchInitiative, fetchHolistic, loadCache]);

  // Auto-fetch when period changes (but not on first render)
  useEffect(() => {
    if (!periodInitRef.current) { periodInitRef.current = true; return; }
    if (period === "custom" && (!customFrom || !customTo)) return; // wait for both dates
    handleRefresh(activeTab, period);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  // ─── Derived display values ────────────────────────────────────────────────

  const initiative   = INITIATIVES.find((i) => i.id === activeTab)!;
  const initiativeData = cacheData?.initiatives?.[activeTab];
  const old     = initiativeData?.old ?? emptyMetrics(initiative.newMotion.maturityDays);
  const newData = initiativeData?.new ?? emptyMetrics(initiative.newMotion.maturityDays);
  const holistic: Record<string, HolisticMonthData> = cacheData?.holistic ?? {};

  const periodDates    = getPeriodDates(period, customFrom, customTo);
  const effectiveDates = getEffectiveDates(initiative, periodDates);

  const hasData      = !!initiativeData;
  const refreshedAt  = lastRefreshed
    ? new Date(lastRefreshed).toLocaleString("en-AU", { timeZone: "Asia/Singapore" }) + " SGT"
    : null;

  const periodLabel = period === "all" ? "All data"
    : period === "this_month" ? "This month"
    : period === "last_month" ? "Last month"
    : period === "this_q"     ? "This quarter (AU FY)"
    : period === "last_q"     ? "Last quarter (AU FY)"
    : "Custom range";

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="wrap">
      {/* ── Header ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>BruntWork · Internal</p>
            <h1>Sales Initiative KPI Tracker</h1>
          </div>

          {/* Period filter + Refresh */}
          <div className="fl">
            <div className="assumption">
              <label>Period</label>
              <select value={period} onChange={(e) => { setErrorMsg(null); setPeriod(e.target.value as Period); }}
                style={{ width: "auto" }}>
                <option value="all">All data</option>
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="this_q">This quarter (AU FY)</option>
                <option value="last_q">Last quarter (AU FY)</option>
                <option value="custom">Custom range</option>
              </select>
            </div>
            {period === "custom" && (
              <div className="fl">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                <span style={{ color: "var(--muted)", fontSize: 11 }}>–</span>
                <input type="date" value={customTo}   onChange={(e) => setCustomTo(e.target.value)}   />
              </div>
            )}
            <button className="btn primary" onClick={() => handleRefresh()} disabled={loading}>
              {loading ? "⟳ Refreshing…" : `↻ Refresh Initiative ${activeTab}`}
            </button>
          </div>
        </div>

        {/* Nav tabs */}
        <div className="nav-tabs">
          {INITIATIVES.map((ini) => (
            <button key={ini.id}
              className={`nav-tab ${activeTab === ini.id ? "active" : ""}`}
              onClick={() => setActiveTab(ini.id)}
            >
              {ini.id}. {ini.name}
              {ini.notYetLaunched && <span style={{ marginLeft: 5, fontSize: 9, opacity: 0.7 }}>BASELINE</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="status">
        <div className={`dot ${loading ? "loading" : hasData ? "" : "error"}`} />
        <span style={{ color: "var(--muted)" }}>
          {loading
            ? `Fetching Initiative ${activeTab} from HubSpot… (${periodLabel})`
            : hasData
            ? `Initiative ${activeTab} · ${periodLabel}${refreshedAt ? ` · ${refreshedAt}` : ""}`
            : "No data — click Refresh to load from HubSpot."}
        </span>
      </div>

      {/* ── Error banner ── */}
      {errorMsg && (
        <div className="banner" style={{ background: "var(--dangerl)", borderColor: "#fca5a5", color: "#991b1b", marginBottom: 12 }}>
          <span className="bicon">⚠</span>
          <div style={{ flex: 1 }}><strong>Error</strong><br />{errorMsg}</div>
          <button onClick={() => setErrorMsg(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontSize: 16, padding: "0 4px", alignSelf: "flex-start" }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Exclusions ── */}
      <ExclusionsPanel />

      {/* ── Initiative content ── */}
      <InitiativeView
        key={activeTab}
        initiative={initiative}
        old={old}
        newData={newData}
        holistic={holistic}
        effectiveNewFrom={effectiveDates?.newFrom ?? initiative.newMotion.dateFrom}
        effectiveNewTo={effectiveDates?.newTo}
      />
    </div>
  );
}
