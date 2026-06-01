"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { INITIATIVES, type Initiative } from "@/config/initiatives";
import type { CacheData } from "@/lib/cache";
import type { HolisticMonthData } from "@/lib/hubspot";
import ExclusionsPanel from "@/components/ExclusionsPanel";
import MonthlyOutcomes from "@/components/MonthlyOutcomes";
import TopOfFunnel from "@/components/TopOfFunnel";
import LeakMap from "@/components/LeakMap";
import InitiativeScorecards from "@/components/InitiativeScorecard";
import ROIModule from "@/components/ROIModule";
import type { MotionMetrics } from "@/lib/hubspot";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "all" | "this_month" | "last_month" | "this_q" | "last_q" | "custom";
interface PeriodDates { from: string; to: string }
interface EffectiveDates { oldFrom: string; oldTo: string; newFrom: string; newTo?: string; }

// ─── AU FY quarter helpers ────────────────────────────────────────────────────

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
  const [holisticData, setHolisticData]   = useState<Record<string, HolisticMonthData>>({});

  // Period filter
  const [period, setPeriod]         = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");

  // Dashboard UI state
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [roiOpen, setRoiOpen]             = useState(false);

  const periodInitRef   = useRef(false);
  const handleRefreshRef = useRef<(tabId?: string, overridePeriod?: Period) => Promise<void>>(() => Promise.resolve());
  const activeTabRef    = useRef(activeTab);

  // ─── Load cache on mount ──────────────────────────────────────────────────
  const loadCache = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      if (res.ok) {
        const data: CacheData = await res.json();
        setCacheData(data);
        setLastRefreshed(data.refreshed_at);
        if (data.holistic && Object.keys(data.holistic).length > 0) {
          setHolisticData(data.holistic);
        }
      }
    } catch { /* cache miss on first load */ }
  }, []);

  useEffect(() => { loadCache(); }, [loadCache]);

  // ─── Fetch helpers ────────────────────────────────────────────────────────
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

  // ─── Refresh handler ──────────────────────────────────────────────────────
  const handleRefresh = useCallback(async (tabId = activeTab, overridePeriod?: Period) => {
    const ini = INITIATIVES.find((i) => i.id === tabId)!;
    const activePeriod = overridePeriod ?? period;
    const periodDates  = getPeriodDates(activePeriod, customFrom, customTo);
    const effective    = getEffectiveDates(ini, periodDates);

    setLoading(true);
    setErrorMsg(null);

    try {
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
          setErrorMsg("Data loaded but cache write failed — data resets on next page load.");
        }
      } else {
        await loadCache();
      }

      if (holisticRes?.data) {
        setHolisticData(holisticRes.data as Record<string, HolisticMonthData>);
      }
    } catch (e) {
      setErrorMsg(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, period, customFrom, customTo, fetchInitiative, loadCache]);

  // Keep refs current
  handleRefreshRef.current = handleRefresh;
  activeTabRef.current = activeTab;

  // Auto-fetch when period changes
  useEffect(() => {
    if (!periodInitRef.current) { periodInitRef.current = true; return; }
    if (period === "custom" && (!customFrom || !customTo)) return;
    handleRefreshRef.current(activeTabRef.current, period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  // ─── Derived values ───────────────────────────────────────────────────────
  const periodDates  = getPeriodDates(period, customFrom, customTo);
  const periodMonths = getMonthsInPeriod(period, customFrom, customTo);

  // Valid months for holistic sections
  const allHolisticMonths = Object.keys(holisticData).sort().reverse();
  const validMonths = periodMonths
    ? allHolisticMonths.filter((m) => periodMonths.includes(m))
    : allHolisticMonths;

  // Auto-select most recent valid month
  useEffect(() => {
    if (validMonths.length > 0 && !validMonths.includes(selectedMonth)) {
      setSelectedMonth(validMonths[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validMonths.join(","), selectedMonth]);

  const holisticMonth = selectedMonth || validMonths[0] || "";
  const d = holisticData[holisticMonth] ?? null;

  // Active initiative for ROI section
  const activeIni  = INITIATIVES.find((i) => i.id === activeTab)!;
  const activeData = cacheData?.initiatives?.[activeTab];
  const roiOld     = activeData?.old ?? emptyMetrics(activeIni.newMotion.maturityDays);
  const roiNew     = activeData?.new ?? emptyMetrics(activeIni.newMotion.maturityDays);

  const refreshedAt = lastRefreshed
    ? new Date(lastRefreshed).toLocaleString("en-AU", { timeZone: "Asia/Singapore" }) + " SGT"
    : null;

  // Toggle scorecard expand — also switch active tab for ROI context
  function handleToggle(id: string) {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) setActiveTab(next);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="wrap">

      {/* ── S1: Header ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>
              BruntWork · Internal · Sales Initiative KPI Tracker
            </div>
            <h1>Sales Initiative Tracker</h1>
          </div>
          <button className="btn primary" onClick={() => handleRefresh(activeTab)} disabled={loading}>
            {loading ? "⟳ Refreshing…" : `↻ Refresh Initiative ${activeTab}`}
          </button>
        </div>

        {/* Period filter */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>Period</span>
          <select
            value={period}
            onChange={(e) => { setErrorMsg(null); setPeriod(e.target.value as Period); }}
          >
            <option value="all">All data</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="this_q">This quarter (AU FY)</option>
            <option value="last_q">Last quarter (AU FY)</option>
            <option value="custom">Custom date range</option>
          </select>
          {period === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span style={{ color: "var(--muted)", fontSize: 11 }}>–</span>
              <input type="date" value={customTo}   onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
        </div>

        {/* Initiative tabs */}
        <div className="nav-tabs">
          {INITIATIVES.map((ini) => (
            <button key={ini.id}
              className={`nav-tab ${activeTab === ini.id ? "active" : ""}`}
              onClick={() => setActiveTab(ini.id)}>
              {ini.id}. {ini.name}
              {ini.notYetLaunched && <span style={{ marginLeft: 5, fontSize: 9, opacity: .7 }}>BASELINE</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="status">
        <div className={`dot ${loading ? "loading" : ""}`} />
        <span>
          {loading
            ? `Refreshing Initiative ${activeTab} from HubSpot…`
            : refreshedAt
            ? `Last refreshed ${refreshedAt}`
            : "No data — click Refresh to load from HubSpot."}
        </span>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="banner" style={{ background: "var(--dangerl)", borderColor: "#fca5a5", color: "#991b1b", marginBottom: 12 }}>
          <span className="bicon">⚠</span>
          <div style={{ flex: 1 }}><strong>Error</strong><br />{errorMsg}</div>
          <button onClick={() => setErrorMsg(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontSize: 16, padding: "0 4px" }}>✕</button>
        </div>
      )}

      <ExclusionsPanel />

      {/* ── S2: Monthly Outcomes ── */}
      {d ? (
        <MonthlyOutcomes
          d={d}
          validMonths={validMonths}
          selectedMonth={holisticMonth}
          onMonthChange={setSelectedMonth}
        />
      ) : (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: "28px 20px" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No data loaded</div>
          <div style={{ fontSize: 12 }}>Click ↻ Refresh to pull the latest data from HubSpot.</div>
        </div>
      )}

      {/* ── S3: Top of Funnel ── */}
      {d && <TopOfFunnel d={d} />}

      {/* ── S4: Leak Map ── */}
      {d && <LeakMap d={d} />}

      {/* ── S5: Initiative Scorecards ── */}
      <InitiativeScorecards
        initiatives={INITIATIVES}
        cacheData={cacheData}
        expandedId={expandedId}
        onToggle={handleToggle}
      />

      {/* ── S6: ROI — collapsible ── */}
      <div style={{ marginTop: 4 }}>
        <button
          className={`collapsible-trigger${roiOpen ? " open" : ""}`}
          onClick={() => setRoiOpen(!roiOpen)}
          type="button"
        >
          <span>Recovery Economics — Initiative {activeTab}</span>
          <span style={{ fontSize: 16, color: "var(--muted)", fontWeight: 400 }}>{roiOpen ? "▲" : "▼"}</span>
        </button>

        {roiOpen && (
          <div className="collapsible-body">
            {activeData ? (
              <ROIModule
                old={roiOld}
                newData={roiNew}
                defaultCostOld={activeIni.oldMotion.seqCostPerMeeting}
                defaultCostNew={activeIni.newMotion.seqCostPerMeeting}
              />
            ) : (
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                No data for Initiative {activeTab} yet — click Refresh.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Period filter note ── */}
      {periodDates && (
        <div style={{ marginTop: 20, fontSize: 10, color: "var(--muted)", textAlign: "center" }}>
          Period filter active: {periodDates.from} – {periodDates.to} · Cohort funnels filter by enrollment date.
          Holistic sections use selected month ({holisticMonth || "none"}).
        </div>
      )}
    </div>
  );
}
