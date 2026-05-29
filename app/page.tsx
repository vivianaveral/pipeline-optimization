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
  newFrom: string; newTo?: string;
}

// ─── AU FY quarter helpers (Q1 Jul–Sep, Q2 Oct–Dec, Q3 Jan–Mar, Q4 Apr–Jun) ──

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
  const today = new Date(); const todayStr = toDateStr(today);
  if (period === "all") return null;
  if (period === "this_month")
    return { from: toDateStr(new Date(today.getFullYear(), today.getMonth(), 1)), to: todayStr };
  if (period === "last_month")
    return { from: toDateStr(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
             to:   toDateStr(new Date(today.getFullYear(), today.getMonth(), 0)) };
  if (period === "this_q") { const q = getAUFYQuarter(today); return { from: toDateStr(q.start), to: todayStr }; }
  if (period === "last_q") { const q = getLastAUFYQuarter(today); return { from: toDateStr(q.start), to: toDateStr(q.end) }; }
  if (period === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
  return null;
}

// Calendar months covered by the active period — used to scope the holistic funnel.
function getMonthsInPeriod(period: Period, customFrom: string, customTo: string): string[] | null {
  const dates = getPeriodDates(period, customFrom, customTo);
  if (!dates) return null;
  const months: string[] = [];
  const cur = new Date(new Date(dates.from).getFullYear(), new Date(dates.from).getMonth(), 1);
  const end = new Date(dates.to);
  while (cur <= end) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

// Intersect period window with initiative config dates.
function getEffectiveDates(ini: Initiative, period: PeriodDates | null): EffectiveDates | null {
  const today = toDateStr(new Date());
  const configOldFrom = ini.oldMotion.dateFrom;
  const configOldTo   = ini.oldMotion.dateTo && ini.oldMotion.dateTo !== "TBD" ? ini.oldMotion.dateTo : today;
  const configNewFrom = ini.newMotion.dateFrom !== "TBD" ? ini.newMotion.dateFrom : today;
  if (!period) return null;
  return {
    oldFrom: period.from > configOldFrom ? period.from : configOldFrom,
    oldTo:   period.to   < configOldTo   ? period.to   : configOldTo,
    newFrom: period.from > configNewFrom  ? period.from : configNewFrom,
    newTo:   period.to,
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [activeTab, setActiveTab]         = useState("01");
  const [cacheData, setCacheData]         = useState<CacheData | null>(null);
  const [loading, setLoading]             = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);

  // Holistic data lives in its OWN state slice — never cleared by initiative refreshes.
  const [holisticData, setHolisticData]   = useState<Record<string, HolisticMonthData>>({});

  // Period filter
  const [period, setPeriod]         = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");

  const periodInitRef = useRef(false);
  // Refs always pointing to latest values — avoids stale-closure bug in period effect
  const handleRefreshRef = useRef<(tabId?: string, overridePeriod?: Period) => Promise<void>>(() => Promise.resolve());
  const activeTabRef = useRef(activeTab);

  // ─── Load server cache on mount ──────────────────────────────────────────────
  const loadCache = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      if (res.ok) {
        const data: CacheData = await res.json();
        setCacheData(data);
        setLastRefreshed(data.refreshed_at);
        // Populate holistic state from cache independently
        if (data.holistic && Object.keys(data.holistic).length > 0) {
          setHolisticData(data.holistic);
        }
      }
    } catch { /* cache miss on first load — fine */ }
  }, []);

  useEffect(() => { loadCache(); }, [loadCache]);

  // ─── Fetch helpers ────────────────────────────────────────────────────────────
  const fetchInitiative = useCallback(async (tabId: string, effectiveDates: EffectiveDates | null) => {
    const url = new URL("/api/refresh", window.location.origin);
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

  // ─── Refresh handler ──────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async (tabId = activeTab, overridePeriod?: Period) => {
    const ini = INITIATIVES.find((i) => i.id === tabId)!;
    const activePeriod = overridePeriod ?? period;
    const periodDates  = getPeriodDates(activePeriod, customFrom, customTo);
    const effective    = getEffectiveDates(ini, periodDates);

    setLoading(true);
    setErrorMsg(null);

    try {
      // Fetch initiative and holistic in parallel
      const [json, holisticRes] = await Promise.all([
        fetchInitiative(tabId, effective),
        fetch("/api/refresh?step=holistic", { method: "POST" }).then(r => r.json()).catch(() => null),
      ]);

      if (json.data) {
        setCacheData((prev) => ({
          refreshed_at: new Date().toISOString(),
          initiatives: { ...(prev?.initiatives ?? {}), [tabId]: json.data as CacheData["initiatives"][string] },
          holistic: prev?.holistic ?? {},
        }));
        setLastRefreshed(new Date().toISOString());

        if (json.cache_written === false) {
          setErrorMsg("Data loaded but cache write failed — data will reset on next page load. Check Railway logs.");
        }
      } else {
        await loadCache();
      }

      // Update holistic state from parallel fetch result
      if (holisticRes?.data) {
        setHolisticData(holisticRes.data as Record<string, HolisticMonthData>);
      }
    } catch (e) {
      setErrorMsg(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, period, customFrom, customTo, fetchInitiative, loadCache]);

  // Keep refs current on every render so the period effect never has a stale closure
  handleRefreshRef.current = handleRefresh;
  activeTabRef.current = activeTab;

  // Auto-fetch when period changes (skip first render).
  useEffect(() => {
    if (!periodInitRef.current) { periodInitRef.current = true; return; }
    if (period === "custom" && (!customFrom || !customTo)) return;
    handleRefreshRef.current(activeTabRef.current, period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  // ─── Derived values ───────────────────────────────────────────────────────────
  const initiative     = INITIATIVES.find((i) => i.id === activeTab)!;
  const initiativeData = cacheData?.initiatives?.[activeTab];
  const old     = initiativeData?.old ?? emptyMetrics(initiative.newMotion.maturityDays);
  const newData = initiativeData?.new ?? emptyMetrics(initiative.newMotion.maturityDays);

  const periodDates    = getPeriodDates(period, customFrom, customTo);
  const effectiveDates = getEffectiveDates(initiative, periodDates);
  const periodMonths   = getMonthsInPeriod(period, customFrom, customTo);

  const hasData     = !!initiativeData;
  const refreshedAt = lastRefreshed
    ? new Date(lastRefreshed).toLocaleString("en-AU", { timeZone: "Asia/Singapore" }) + " SGT"
    : null;

  const periodLabel = period === "all"        ? "All data"
    : period === "this_month" ? "This month"
    : period === "last_month" ? "Last month"
    : period === "this_q"     ? "This quarter (AU FY)"
    : period === "last_q"     ? "Last quarter (AU FY)"
    : customFrom && customTo  ? `${customFrom} – ${customTo}`
    : "Custom range";

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="wrap">

      {/* ── Header card ── */}
      <div className="card">

        {/* Row 1: title + refresh button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>BruntWork · Internal</p>
            <h1>Sales Initiative KPI Tracker</h1>
          </div>
          <button className="btn primary" onClick={() => handleRefresh()} disabled={loading}>
            {loading ? "⟳ Refreshing…" : `↻ Refresh Initiative ${activeTab}`}
          </button>
        </div>

        {/* Row 2: period filter — its own clearly visible row */}
        <div style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10,
          marginTop: 12, paddingTop: 12,
          borderTop: "1px solid var(--border)",
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", minWidth: 46 }}>Period</span>
          <select
            value={period}
            onChange={(e) => { setErrorMsg(null); setPeriod(e.target.value as Period); }}
            style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" }}
          >
            <option value="all">All data</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="this_q">This quarter (AU FY Q1=Jul–Sep, Q2=Oct–Dec, Q3=Jan–Mar, Q4=Apr–Jun)</option>
            <option value="last_q">Last quarter (AU FY)</option>
            <option value="custom">Custom date range</option>
          </select>
          {period === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)" }} />
              <span style={{ color: "var(--muted)", fontSize: 11 }}>–</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)" }} />
            </>
          )}
          {period !== "all" && (
            <span style={{ fontSize: 11, color: "var(--old)", fontWeight: 500 }}>
              Filters both cohort funnels + holistic funnel
            </span>
          )}
        </div>

        {/* Row 3: initiative nav tabs */}
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
        holistic={holisticData}
        effectiveNewFrom={effectiveDates?.newFrom ?? initiative.newMotion.dateFrom}
        effectiveNewTo={effectiveDates?.newTo}
        periodMonths={periodMonths}
      />
    </div>
  );
}
