"use client";
import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface MonthlyMetrics {
  month: string;
  callsBooked: number; noShows: number; attended: number;
  billingEntered: number; parkingLot: number;
  dropOffs: number; dropRate: number;
  closedWon: number; activeClient: number; closedLost: number;
  missedZoom_cl: number; missedZoom_rebooked: number; missedZoom_open: number;
  billing_cl: number; billing_progressed: number; billing_active: number;
  recruiting: number; resumesSent: number; interviewScheduled: number; agreementSent: number;
  cohort_leads: number; cohort_bookRate: number; cohort_noShowRate: number;
  cohort_pipelineRate: number; cohort_activeRate: number;
  cohort_daysOld: number; cohort_maturity: "too_early"|"immature"|"partial"|"mature";
}

interface CohortMetrics {
  enrolled: number; meetingRate: number; pipelineRate: number;
  activeRate: number; clNoMeetingRate: number; rebookRate: number;
  billingClRate: number; avgDaysToPipeline: number; cohortAgeDays: number; isMature: boolean;
}

interface ApiData {
  lastRefreshed: string; dealCount: number;
  defaultPipelineDealCount: number; activeClientDealCount: number;
  computed: { byMonth: Record<string, MonthlyMetrics> };
  initiatives: Record<string, { id: string; old: CohortMetrics; new: CohortMetrics }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun",
  "07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec",
};
function fmtMonth(key: string) {
  const [y, mo] = key.split("-");
  return `${MONTH_NAMES[mo]} ${y}`;
}
function n(v: number) { return v.toLocaleString(); }
function pct(v: number) { return `${v.toFixed(1)}%`; }
function pp(a: number, b: number) {
  const d = b - a;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}pp`;
}

// ── Design tokens ──────────────────────────────────────────────────────────────

const C = {
  blue: "#185FA5", blueBg: "#E6F1FB", blueBd: "#B5D4F4", blueText: "#0C447C",
  green: "#0F6E56", greenBg: "#EAF3DE", greenBd: "#C0DD97", greenText: "#27500A",
  amber: "#BA7517", amberBg: "#FAEEDA", amberBd: "#FAC775", amberText: "#633806",
  red: "#A32D2D", redBg: "#FCEBEB", redBd: "#F5C6C6",
  bg2: "#F7F6F3", border: "#E5E3DB",
  text: "#1C1B18", text2: "#6B6960",
};

// ── Status badge ───────────────────────────────────────────────────────────────

type StatusType = "confirmed" | "measuring" | "baseline" | "underperforming";

function StatusBadge({ status }: { status: StatusType }) {
  const map: Record<StatusType, { bg: string; color: string; label: string }> = {
    confirmed:       { bg: C.greenBg, color: C.greenText, label: "Confirmed"       },
    measuring:       { bg: C.amberBg, color: C.amberText, label: "Measuring"       },
    baseline:        { bg: "#F1EFE8", color: "#444441",   label: "Baseline"        },
    underperforming: { bg: C.redBg,   color: C.red,       label: "Underperforming" },
  };
  const s = map[status];
  return (
    <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:4,
      fontSize:11, fontWeight:500, background:s.bg, color:s.color, whiteSpace:"nowrap" }}>
      {s.label}
    </span>
  );
}

type PillColor = "blue"|"green"|"amber"|"grey"|"red";
function Pill({ color, children }: { color: PillColor; children: React.ReactNode }) {
  const map: Record<PillColor, { bg: string; color: string }> = {
    blue:  { bg: C.blueBg,  color: C.blueText  },
    green: { bg: C.greenBg, color: C.greenText  },
    amber: { bg: C.amberBg, color: C.amberText  },
    grey:  { bg: "#F1EFE8", color: "#444441"    },
    red:   { bg: C.redBg,   color: C.red        },
  };
  const s = map[color];
  return (
    <span style={{ display:"inline-block", padding:"1px 8px", borderRadius:4,
      fontSize:11, fontWeight:500, background:s.bg, color:s.color }}>
      {children}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function KpiTracker() {
  const [tab, setTab] = useState<"ii"|"fo"|"me">("ii");
  const [data, setData] = useState<ApiData | null>(null);
  const [selMonth, setSelMonth] = useState("2026-05");
  const [selectedInit, setSelectedInit] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      if (res.status === 404) { setData(null); return; }
      if (!res.ok) return;
      const d: ApiData = await res.json();
      setData(d);
      const months = Object.keys(d.computed.byMonth).sort();
      if (months.length) setSelMonth(months[months.length - 1]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRefresh() {
    setRefreshing(true); setRefreshMsg(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setRefreshMsg({ ok: false, msg: json.error ?? "Unknown error" }); return; }
      setRefreshMsg({ ok: true, msg: `Refreshed ${new Date(json.timestamp).toLocaleString()} · ${json.counts?.allDeals ?? ""} deals` });
      await loadData();
    } catch (e) { setRefreshMsg({ ok: false, msg: String(e) }); }
    finally { setRefreshing(false); }
  }

  const months = data ? Object.keys(data.computed.byMonth).sort() : [];
  const m = data?.computed.byMonth[selMonth];
  const inits = data?.initiatives;

  return (
    <div style={{ background: "#fff", minHeight: "100vh", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 16px 48px" }}>

        {/* Header */}
        <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 10,
          padding: "11px 18px", marginBottom: 12, display: "flex",
          justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: C.text2, marginBottom: 1 }}>BruntWork · Internal</div>
            <div style={{ fontSize: 17, fontWeight: 500 }}>Sales Initiative KPI Tracker</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {data && (
              <select value={selMonth} onChange={e => setSelMonth(e.target.value)}
                style={{ fontSize: 12, padding: "4px 8px", border: `0.5px solid ${C.border}`,
                  borderRadius: 6, background: "#fff", color: C.text }}>
                {[...months].reverse().map(mk => (
                  <option key={mk} value={mk}>
                    {fmtMonth(mk)}{mk === months[months.length - 1] ? " (latest)" : ""}
                  </option>
                ))}
              </select>
            )}
            {data && (
              <span style={{ fontSize: 11, color: C.text2 }}>
                {new Date(data.lastRefreshed).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
            <button onClick={handleRefresh} disabled={refreshing}
              style={{ padding: "5px 12px", borderRadius: 6, border: "none",
                background: refreshing ? "#aaa" : C.blue, color: "#fff",
                fontSize: 12, cursor: refreshing ? "default" : "pointer", fontFamily: "inherit" }}>
              {refreshing ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {refreshMsg && (
          <div style={{ marginBottom: 10, fontSize: 12, padding: "6px 12px", borderRadius: 6,
            background: refreshMsg.ok ? C.greenBg : C.redBg,
            color: refreshMsg.ok ? C.greenText : C.red,
            border: `0.5px solid ${refreshMsg.ok ? C.greenBd : C.redBd}` }}>
            {refreshMsg.ok ? "✓ " : "✗ "}{refreshMsg.msg}
          </div>
        )}

        {!data && (
          <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 10,
            padding: 32, color: C.text2, textAlign: "center" }}>
            No data yet — click <b style={{ color: C.text }}>↻ Refresh</b> to load from HubSpot.
          </div>
        )}

        {data && m && (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `0.5px solid ${C.border}` }}>
              {([
                ["ii", "Initiative Impact"],
                ["fo", "Funnel Opportunity Map"],
                ["me", "Methodology"],
              ] as const).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)}
                  style={{ padding: "8px 16px", border: "none", background: "none",
                    fontSize: 13, color: tab === id ? C.blue : C.text2, cursor: "pointer",
                    fontFamily: "inherit",
                    borderBottom: tab === id ? `2px solid ${C.blue}` : "2px solid transparent",
                    marginBottom: -0.5, fontWeight: tab === id ? 500 : 400, whiteSpace: "nowrap" }}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "ii" && (
              <InitiativeImpactTab
                m={m} inits={inits} selMonth={selMonth}
                selectedInit={selectedInit} setSelectedInit={setSelectedInit}
              />
            )}
            {tab === "fo" && (
              <FunnelOpportunityTab m={m} data={data} months={months} selMonth={selMonth} />
            )}
            {tab === "me" && (
              <MethodologyTab data={data} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — INITIATIVE IMPACT
// ══════════════════════════════════════════════════════════════════════════════

interface InitDef {
  num: number;
  key: string;
  name: string;
  shortName: string;
  status: StatusType;
  entryStage: string;
  primaryMetricLabel: string;
  beforeValue: (iv: { old: CohortMetrics; new: CohortMetrics } | undefined) => string;
  afterValue:  (iv: { old: CohortMetrics; new: CohortMetrics } | undefined) => string;
  liftValue:   (iv: { old: CohortMetrics; new: CohortMetrics } | undefined) => string;
  advancedValue:(iv: { old: CohortMetrics; new: CohortMetrics } | undefined) => string;
  clientsValue:(iv: { old: CohortMetrics; new: CohortMetrics } | undefined) => string;
  nextRead: string;
}

const INITIATIVES: InitDef[] = [
  {
    num: 1, key: "01",
    name: "Form Fill / No Call Booked", shortName: "Form Fill",
    status: "confirmed",
    entryStage: "Enrolled in Sequence (28807353)",
    primaryMetricLabel: "Meeting Rate",
    beforeValue:  (iv) => iv ? pct(iv.old.meetingRate) : "16.5%",
    afterValue:   (iv) => (iv && iv.new.enrolled > 0) ? pct(iv.new.meetingRate) : "27.1%",
    liftValue:    (iv) => (iv && iv.new.enrolled > 0) ? pp(iv.old.meetingRate, iv.new.meetingRate) : "+10.6pp",
    advancedValue:(iv) => {
      if (!iv || iv.new.enrolled <= 0) return "+21";
      return `+${Math.round((iv.new.meetingRate - iv.old.meetingRate) / 100 * (iv.old.enrolled || 196))}`;
    },
    clientsValue: () => "+2.8",
    nextRead: "Jul 1",
  },
  {
    num: 2, key: "02",
    name: "Missed Zoom Call", shortName: "Missed Zoom",
    status: "measuring",
    entryStage: "Missed Zoom Call (28817239)",
    primaryMetricLabel: "Rebook Rate",
    beforeValue:  (iv) => iv ? pct(iv.old.rebookRate) : "4.4%",
    afterValue:   () => "—",
    liftValue:    () => "—",
    advancedValue:() => "—",
    clientsValue: () => "—",
    nextRead: "Jul 10",
  },
  {
    num: 3, key: "03",
    name: "TZ Rebook", shortName: "TZ Rebook",
    status: "measuring",
    entryStage: "Missed Zoom Call — TZ cohort",
    primaryMetricLabel: "Rebook Rate",
    beforeValue:  () => "—",
    afterValue:   () => "—",
    liftValue:    () => "—",
    advancedValue:() => "—",
    clientsValue: () => "—",
    nextRead: "Jun 15",
  },
  {
    num: 4, key: "04",
    name: "48hr Tasks", shortName: "48hr Tasks",
    status: "measuring",
    entryStage: "Billing Details (22600467) · Recruiting (5423787)",
    primaryMetricLabel: "Pipeline Velocity",
    beforeValue:  (iv) => iv ? `${pct(iv.old.billingClRate)} billing CL` : "37% billing CL",
    afterValue:   () => "—",
    liftValue:    () => "—",
    advancedValue:() => "—",
    clientsValue: () => "—",
    nextRead: "Jun 23",
  },
  {
    num: 5, key: "05",
    name: "Pre-Meeting Email", shortName: "Pre-Meeting",
    status: "baseline",
    entryStage: "Zoom Call Booked (13542462)",
    primaryMetricLabel: "Show Rate",
    beforeValue:  () => "~59% show rate",
    afterValue:   () => "—",
    liftValue:    () => "—",
    advancedValue:() => "—",
    clientsValue: () => "—",
    nextRead: "TBD",
  },
];

function InitiativeImpactTab({ m, inits, selMonth, selectedInit, setSelectedInit }: {
  m: MonthlyMetrics;
  inits: ApiData["initiatives"] | undefined;
  selMonth: string;
  selectedInit: number;
  setSelectedInit: (n: number) => void;
}) {
  void m;

  const init1 = inits?.["01"];
  const additionalAdvanced = (() => {
    if (!init1 || init1.new.enrolled <= 0) return 21;
    return Math.round((init1.new.meetingRate - init1.old.meetingRate) / 100 * (init1.old.enrolled || 196));
  })();

  const selectedDef = INITIATIVES[selectedInit - 1];
  const selectedIv  = inits?.[selectedDef.key];

  return (
    <>
      {/* Summary KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryCard label="Active Initiatives"           value="5"                  color={C.blue}  detail="across 5 funnel stages" />
        <SummaryCard label="Confirmed Wins"               value="1"                  color={C.green} detail="with measured conversion lift" />
        <SummaryCard label="Additional Opps Advanced"     value={`+${additionalAdvanced}`} color={C.green} detail="from confirmed initiatives" />
        <SummaryCard label="Projected Additional Clients" value="+2.8"               color={C.blue}  detail="per month · if downstream rates hold" />
      </div>

      {/* Scorecard table */}
      <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 10,
        overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "12px 16px", borderBottom: `0.5px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Initiative Scorecard — {fmtMonth(selMonth)}</div>
          <div style={{ fontSize: 11, color: C.text2 }}>Select a row to see detail below</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.bg2 }}>
              {["Initiative","Status","Before Conv.","After Conv.","Conversion Lift","Adv. Opps","Clients","Next Read"].map(h => (
                <th key={h} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em",
                  color: C.text2, fontWeight: 500, padding: "8px 12px",
                  textAlign: h === "Initiative" ? "left" : "center",
                  borderBottom: `0.5px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INITIATIVES.map(init => {
              const iv = inits?.[init.key];
              const isSelected = selectedInit === init.num;
              const lift = init.liftValue(iv);
              const hasLift = lift !== "—";
              const adv  = init.advancedValue(iv);
              const cli  = init.clientsValue(iv);
              return (
                <tr key={init.num} onClick={() => setSelectedInit(init.num)}
                  style={{ borderBottom: `0.5px solid ${C.border}`, cursor: "pointer",
                    background: isSelected ? C.blueBg : undefined,
                    borderLeft: isSelected ? `3px solid ${C.blue}` : "3px solid transparent" }}>
                  <td style={{ padding: "11px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>0{init.num} · {init.shortName}</div>
                    <div style={{ fontSize: 10, color: C.text2, marginTop: 1 }}>{init.primaryMetricLabel}</div>
                  </td>
                  <td style={{ padding: "11px 12px", textAlign: "center" }}>
                    <StatusBadge status={init.status} />
                  </td>
                  <td style={{ padding: "11px 12px", textAlign: "center", color: C.text2 }}>
                    {init.beforeValue(iv)}
                  </td>
                  <td style={{ padding: "11px 12px", textAlign: "center",
                    color: init.afterValue(iv) !== "—" ? C.green : C.text2,
                    fontWeight: init.afterValue(iv) !== "—" ? 600 : 400 }}>
                    {init.afterValue(iv)}
                  </td>
                  <td style={{ padding: "11px 12px", textAlign: "center" }}>
                    {hasLift
                      ? <span style={{ fontWeight: 700, color: C.green }}>{lift}</span>
                      : <span style={{ color: C.text2 }}>—</span>}
                  </td>
                  <td style={{ padding: "11px 12px", textAlign: "center",
                    fontWeight: adv !== "—" ? 700 : 400,
                    color: adv !== "—" ? C.green : C.text2 }}>{adv}</td>
                  <td style={{ padding: "11px 12px", textAlign: "center",
                    fontWeight: cli !== "—" ? 600 : 400,
                    color: cli !== "—" ? C.blue : C.text2 }}>{cli}</td>
                  <td style={{ padding: "11px 12px", textAlign: "center",
                    color: init.nextRead === "TBD" ? C.text2 : C.amber, fontSize: 11 }}>
                    {init.nextRead}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Initiative detail panel */}
      <InitiativeDetailPanel num={selectedInit} def={selectedDef} iv={selectedIv} />
    </>
  );
}

// ── Initiative detail panel ────────────────────────────────────────────────────

function InitiativeDetailPanel({ num, def, iv }: {
  num: number;
  def: InitDef;
  iv: { old: CohortMetrics; new: CohortMetrics } | undefined;
}) {
  const isInit01 = num === 1;

  // Compute before/after numbers
  let bEntered = 196, bConv = 16.5, bAdvanced = 32, bLost = 164;
  let aEntered = 196, aConv = 27.1, aAdvanced = 53, aLost = 143;
  let liftPp = 10.6, addlAdv = 21, fewerLost = 21;

  if (isInit01 && iv) {
    bEntered  = iv.old.enrolled || 196;
    bConv     = iv.old.meetingRate;
    bAdvanced = Math.round(bConv / 100 * bEntered);
    bLost     = bEntered - bAdvanced;

    const hasNew = iv.new.enrolled > 0;
    aConv     = hasNew ? iv.new.meetingRate : 27.1;
    aEntered  = hasNew ? iv.new.enrolled  : 196;
    aAdvanced = Math.round(aConv / 100 * aEntered);
    aLost     = aEntered - aAdvanced;

    liftPp    = aConv - bConv;
    addlAdv   = aAdvanced - bAdvanced;
    fewerLost = bLost - aLost;
  }

  return (
    <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "20px 24px" }}>

      {/* Title row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: C.text2, marginBottom: 2 }}>Initiative 0{num}</div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{def.name}</div>
          <div style={{ fontSize: 11, color: C.text2, marginTop: 3 }}>
            Entry stage: {def.entryStage} &nbsp;·&nbsp; Primary metric: {def.primaryMetricLabel}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <StatusBadge status={def.status} />
          <span style={{ fontSize: 11, color: C.amber }}>Next read: <b>{def.nextRead}</b></span>
        </div>
      </div>

      {isInit01 ? (
        /* ── Init 01: full before / after / impact ── */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

          {/* BEFORE */}
          <div style={{ background: C.bg2, borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: C.text2, marginBottom: 10 }}>Before</div>
            <BARow label="Opportunities Entered"  value={n(bEntered)}  />
            <BARow label="Opportunities Advanced" value={n(bAdvanced)} />
            <BARow label="Opportunities Lost"     value={n(bLost)}     />
            <BARow label="Conversion Rate"        value={pct(bConv)}   highlight color={C.blue} />
          </div>

          {/* AFTER */}
          <div style={{ background: C.bg2, borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: C.text2, marginBottom: 10 }}>After</div>
            <BARow label="Opportunities Entered"  value={n(aEntered)}  />
            <BARow label="Opportunities Advanced" value={n(aAdvanced)} />
            <BARow label="Opportunities Lost"     value={n(aLost)}     />
            <BARow label="Conversion Rate"        value={pct(aConv)}   highlight color={C.green} />
          </div>

          {/* IMPACT */}
          <div style={{ background: C.greenBg, border: `0.5px solid ${C.greenBd}`, borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: C.greenText, marginBottom: 10 }}>Impact</div>
            <ImpRow label="Opportunities Advanced" value={`+${addlAdv}`}              large />
            <ImpRow label="Opportunities Lost"     value={`−${fewerLost}`}            large />
            <ImpRow label="Conversion Lift"        value={`+${liftPp.toFixed(1)}pp`}  large />
            <ImpRow label="Additional Clients"     value="+2.8"                       large />
            <ImpRow label="Revenue Impact"         value="+$8,310 margin LTV"         />
            <div style={{ marginTop: 10, paddingTop: 8,
              borderTop: `0.5px solid ${C.greenBd}`, fontSize: 10, color: C.greenText }}>
              Downstream confirmation: <b>{def.nextRead}</b>
            </div>
          </div>
        </div>

      ) : (
        /* ── Other initiatives: baseline + measuring state ── */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Baseline */}
          <div style={{ background: C.bg2, borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", color: C.text2, marginBottom: 10 }}>Baseline (Before)</div>
            {num === 2 && <>
              <BARow label="No-show CL rate"        value={iv ? pct(iv.old.clNoMeetingRate || 68) : "68%"} />
              <BARow label="Rebook conversion"      value={iv ? pct(iv.old.rebookRate) : "4.4%"} />
              <BARow label="Open deals / month"     value="196" />
              <BARow label="Old motion"             value="No active recovery" />
            </>}
            {num === 3 && <>
              <BARow label="Baseline cohort"        value="Feb–Apr 2026" />
              <BARow label="Old motion"             value="Passive rebook email" />
              <BARow label="Baseline status"        value="Being compiled" />
            </>}
            {num === 4 && <>
              <BARow label="Billing CL rate"        value={iv ? pct(iv.old.billingClRate) : "37%"} />
              <BARow label="Old motion"             value="No automated follow-up" />
              <BARow label="Metric"                 value="Billing → Recruiting velocity" />
            </>}
            {num === 5 && <>
              <BARow label="Show rate (proxy)"      value="~59%" />
              <BARow label="No-show rate"           value="~41%" />
              <BARow label="Launch"                 value="TBD — confirm with Kate" />
            </>}
          </div>

          {/* Current state */}
          <div style={{ background: def.status === "baseline" ? "#F1EFE8" : C.amberBg,
            border: `0.5px solid ${def.status === "baseline" ? C.border : C.amberBd}`,
            borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: def.status === "baseline" ? "#444441" : C.amberText, marginBottom: 10 }}>
              {def.status === "baseline" ? "Not Yet Launched" : "Measuring"}
            </div>
            {num === 2 && (
              <div style={{ fontSize: 12, color: C.amberText, lineHeight: 1.7 }}>
                <b>4 days live.</b> SDR calling within hours of no-show.<br/>
                196 open deals/month the old process never recovered.<br/>
                First data point: <b>Jun 10.</b>
              </div>
            )}
            {num === 3 && (
              <div style={{ fontSize: 12, color: C.amberText, lineHeight: 1.7 }}>
                <b>54 days live.</b> SDR outbound via Rebook TZ task queue.<br/>
                Approaching 42-day read window.<br/>
                Pull old motion baseline before <b>Jun 15.</b>
              </div>
            )}
            {num === 4 && (
              <div style={{ fontSize: 12, color: C.amberText, lineHeight: 1.7 }}>
                <b>21 days live.</b> 48-hour task on no response after billing.<br/>
                Watch: billing → recruiting conversion rate week over week.<br/>
                Read date: <b>Jun 23.</b>
              </div>
            )}
            {num === 5 && (
              <div style={{ fontSize: 12, color: "#444441", lineHeight: 1.7 }}>
                <b>Baseline locked.</b> Not yet launched.<br/>
                Planned: branded video + FAQs sent immediately after booking.<br/>
                Confirm launch date with Kate before <b>Jun 15.</b>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BARow({ label, value, highlight, color }: {
  label: string; value: string; highlight?: boolean; color?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "5px 0", borderBottom: `0.5px solid ${C.border}` }}>
      <span style={{ fontSize: 11, color: C.text2 }}>{label}</span>
      <span style={{ fontSize: highlight ? 15 : 12, fontWeight: highlight ? 700 : 500,
        color: color ?? C.text }}>{value}</span>
    </div>
  );
}

function ImpRow({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "5px 0", borderBottom: `0.5px solid ${C.greenBd}` }}>
      <span style={{ fontSize: 11, color: C.greenText }}>{label}</span>
      <span style={{ fontSize: large ? 14 : 12, fontWeight: 700, color: C.green }}>{value}</span>
    </div>
  );
}

function SummaryCard({ label, value, color, detail }: {
  label: string; value: string; color: string; detail?: string;
}) {
  return (
    <div style={{ background: C.bg2, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: C.text2, marginBottom: 6,
        textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color, marginBottom: 5 }}>{value}</div>
      {detail && <div style={{ fontSize: 10, color: C.text2 }}>{detail}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — FUNNEL OPPORTUNITY MAP
// ══════════════════════════════════════════════════════════════════════════════

function FunnelOpportunityTab({ m, data, months, selMonth }: {
  m: MonthlyMetrics; data: ApiData; months: string[]; selMonth: string;
}) {
  function lossColor(rate: number | null) {
    if (rate === null) return C.text2;
    if (rate > 50) return C.red;
    if (rate > 25) return C.amber;
    return "#3B6D11";
  }

  const funnelStages: {
    stage: string; note: string;
    entered: number; advanced: number | null; lost: number | null;
    conv: number | null; lossRate: number | null;
    initiative: string | null;
    directional?: boolean;
  }[] = [
    {
      stage: "Calls Booked",
      note: "Valid leads with zoom date in month",
      entered: m.callsBooked,
      advanced: m.attended,
      lost: m.noShows,
      conv: m.callsBooked > 0 ? m.attended / m.callsBooked * 100 : null,
      lossRate: m.callsBooked > 0 ? m.noShows / m.callsBooked * 100 : null,
      initiative: "02 · 03",
    },
    {
      stage: "Attended Call",
      note: "Booked minus no-shows · proxy",
      entered: m.attended,
      advanced: m.billingEntered,
      lost: m.dropOffs,
      conv: m.attended > 0 ? m.billingEntered / m.attended * 100 : null,
      lossRate: m.dropRate,
      initiative: null,
    },
    {
      stage: "Billing Details",
      note: "First post-call stage",
      entered: m.billingEntered,
      advanced: m.billing_progressed,
      lost: m.billing_cl,
      conv: m.billingEntered > 0 ? m.billing_progressed / m.billingEntered * 100 : null,
      lossRate: m.billingEntered > 0 ? m.billing_cl / m.billingEntered * 100 : null,
      initiative: "04",
    },
    {
      stage: "Recruiting",
      note: "Rep opens job order · directional",
      entered: m.recruiting,
      advanced: m.resumesSent,
      lost: Math.round(m.recruiting * 0.22),
      conv: 78,
      lossRate: 22,
      initiative: null,
      directional: true,
    },
    {
      stage: "Resumes Sent",
      note: "Candidates shared with client · directional",
      entered: m.resumesSent,
      advanced: m.interviewScheduled,
      lost: Math.round(m.resumesSent * 0.20),
      conv: 80,
      lossRate: 20,
      initiative: null,
      directional: true,
    },
    {
      stage: "Interview Scheduled",
      note: "Client selects candidates · directional",
      entered: m.interviewScheduled,
      advanced: m.agreementSent,
      lost: Math.round(m.interviewScheduled * 0.12),
      conv: 88,
      lossRate: 12,
      initiative: null,
      directional: true,
    },
    {
      stage: "Agreement Sent",
      note: "Client picks candidate · directional",
      entered: m.agreementSent,
      advanced: Math.round(m.agreementSent * 0.96),
      lost: Math.round(m.agreementSent * 0.04),
      conv: 96,
      lossRate: 4,
      initiative: null,
      directional: true,
    },
    {
      stage: "Active Client",
      note: "Deposit paid · placement confirmed",
      entered: m.activeClient,
      advanced: null,
      lost: null,
      conv: null,
      lossRate: null,
      initiative: null,
    },
  ];

  const trendMonths = months.filter(mk => data.computed.byMonth[mk].callsBooked > 0);

  return (
    <>
      <div style={{ background: C.bg2, border: `0.5px solid ${C.border}`, borderRadius: 6,
        padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.text2 }}>
        Diagnostic view — where opportunities are being lost. Use this to identify future initiative candidates, not to measure existing initiative success.
      </div>

      {/* Stage funnel table */}
      <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 10,
        overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "12px 16px", borderBottom: `0.5px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Stage-by-Stage Opportunity Map — {fmtMonth(selMonth)}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.bg2 }}>
              {["Stage","Opps Entered","Opps Advanced","Opps Lost","Conversion Rate","Loss Rate","Initiative"].map(h => (
                <th key={h} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em",
                  color: C.text2, fontWeight: 500, padding: "8px 12px",
                  textAlign: h === "Stage" ? "left" : "right",
                  borderBottom: `0.5px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {funnelStages.map((row, i) => (
              <tr key={i} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: row.directional ? C.text2 : C.text }}>
                    {row.directional ? `↳ ${row.stage}` : row.stage}
                  </div>
                  <div style={{ fontSize: 10, color: C.text2, marginTop: 1 }}>{row.note}</div>
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 500 }}>{n(row.entered)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: C.text2 }}>
                  {row.advanced !== null ? n(row.advanced) : "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: C.text2 }}>
                  {row.lost !== null ? n(row.lost) : "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: C.blue, fontWeight: 500 }}>
                  {row.conv !== null ? pct(row.conv) : "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600,
                  color: lossColor(row.lossRate) }}>
                  {row.lossRate !== null ? pct(row.lossRate) : "—"}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  {row.initiative
                    ? <Pill color="amber">{row.initiative}</Pill>
                    : <span style={{ color: C.text2, fontSize: 11 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${C.border}`,
          fontSize: 11, color: C.text2 }}>
          ↳ Sub-stage counts (Recruiting onwards) are directional — reps don&apos;t always update stages in sequence.
          Loss rates use confirmed handoff benchmarks.
        </div>
      </div>

      {/* Stage breakdowns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>No-Show Breakdown</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <MiniStat label="Closed Lost"  value={n(m.missedZoom_cl)}
              sub={`${Math.round(m.missedZoom_cl / Math.max(m.noShows, 1) * 100)}%`} color={C.red} />
            <MiniStat label="Rebooked"     value={n(m.missedZoom_rebooked)}
              sub={`${Math.round(m.missedZoom_rebooked / Math.max(m.noShows, 1) * 100)}%`} color={C.green} />
            <MiniStat label="Still Open"   value={n(m.missedZoom_open)}
              sub={`${Math.round(m.missedZoom_open / Math.max(m.noShows, 1) * 100)}%`} color={C.amber} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: C.text2 }}>Initiatives 02 · 03 target this stage.</div>
        </div>
        <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Billing Breakdown</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <MiniStat label="Closed Lost"  value={n(m.billing_cl)}
              sub={`${Math.round(m.billing_cl / Math.max(m.billingEntered, 1) * 100)}%`} color={C.red} />
            <MiniStat label="Progressed"   value={n(m.billing_progressed)}
              sub={`${Math.round(m.billing_progressed / Math.max(m.billingEntered, 1) * 100)}%`} color={C.green} />
            <MiniStat label="Still Active" value={n(m.billing_active)}
              sub={`${Math.round(m.billing_active / Math.max(m.billingEntered, 1) * 100)}%`} color={C.blue} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: C.text2 }}>Initiative 04 targets this stage.</div>
        </div>
      </div>

      {/* Post-call drop rate trend */}
      <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 10,
        padding: "16px 20px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Post-Call Drop Rate Trend</div>
        <div style={{ fontSize: 12, color: C.text2, marginBottom: 10 }}>
          Attended calls that didn&apos;t enter billing and aren&apos;t in Parking Lot.
          No initiative currently targets this — monitoring only.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["Month","Booked","No-shows","Attended","Billing","Parked","Drop-offs","Drop Rate"].map(h => (
                <th key={h} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em",
                  color: C.text2, fontWeight: 500, padding: "6px 10px",
                  textAlign: h === "Month" ? "left" : "right",
                  borderBottom: `0.5px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trendMonths.map(mk => {
              const r = data.computed.byMonth[mk];
              const rate = r.dropRate;
              return (
                <tr key={mk} style={{ borderBottom: `0.5px solid ${C.border}`,
                  background: mk === selMonth ? C.blueBg : undefined }}>
                  <td style={{ padding: "7px 10px", color: C.text2,
                    fontWeight: mk === selMonth ? 600 : 400 }}>{fmtMonth(mk)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{n(r.callsBooked)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>
                    {n(r.noShows)} ({Math.round(r.noShows / r.callsBooked * 100)}%)
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{n(r.attended)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{n(r.billingEntered)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{n(r.parkingLot)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{n(r.dropOffs)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600,
                    color: rate > 20 ? C.red : rate > 12 ? C.amber : "#3B6D11" }}>
                    {pct(rate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MiniStat({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: string;
}) {
  return (
    <div style={{ background: C.bg2, borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: C.text2, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color }}>{sub}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — METHODOLOGY
// ══════════════════════════════════════════════════════════════════════════════

function MethodologyTab({ data }: { data: ApiData }) {
  return (
    <>
      <div style={{ background: C.bg2, border: `0.5px solid ${C.border}`, borderRadius: 6,
        padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.text2 }}>
        Reference documentation — measurement approach, HubSpot logic, cohort rules, and data confidence.
      </div>

      <MethodSection title="Before / After Methodology">
        <p style={{ margin: 0, fontSize: 12, color: C.text2, lineHeight: 1.8 }}>
          Each initiative has a defined <b style={{ color: C.text }}>old motion period</b>, a <b style={{ color: C.text }}>switch date</b>, and a <b style={{ color: C.text }}>new motion period</b>.
          The dashboard presents a before/after comparison, not a controlled A/B test — a randomised trial is not feasible on a live sales team without contaminating both cohorts.
          Results are treated as <b style={{ color: C.text }}>directional evidence</b>: if the metric moves in the right direction after the switch date, on a comparable cohort size, that is a meaningful signal.
          Limitations: lead quality, market conditions, and rep tenure may differ across old and new cohorts.
        </p>
      </MethodSection>

      <MethodSection title="Initiative Periods and Read Windows">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["Initiative","Old Period","Switch Date","New Period","Primary Metric","Read Window"].map(h => (
                <th key={h} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em",
                  color: C.text2, fontWeight: 500, padding: "6px 10px",
                  textAlign: "left", borderBottom: `0.5px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { k:"01", n:"Form Fill",     old:"Jan 26 – May 16", sw:"May 19", newp:"May 19+",  m:"Meeting rate",      w:"Immediate (meeting). 42+ days (billing, clients)." },
              { k:"02", n:"Missed Zoom",   old:"Before May 27",   sw:"May 28", newp:"May 28+",  m:"Rebook rate",       w:"42+ days. First read Jun 10. Full read Jul 10." },
              { k:"03", n:"TZ Rebook",     old:"Feb 22 – Apr 7",  sw:"Apr 8",  newp:"Apr 8+",   m:"Rebook rate",       w:"42+ days. Read Jun 15. Pull baseline first." },
              { k:"04", n:"48hr Tasks",    old:"Before May 11",   sw:"May 12", newp:"May 12+",  m:"Pipeline velocity", w:"Week-over-week. Read Jun 23." },
              { k:"05", n:"Pre-Meeting",   old:"N/A",             sw:"TBD",    newp:"TBD",      m:"Show rate",         w:"After launch. Baseline: ~59%." },
            ].map(row => (
              <tr key={row.k} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                <td style={{ padding: "8px 10px", fontWeight: 500 }}>0{row.k} · {row.n}</td>
                <td style={{ padding: "8px 10px", color: C.text2 }}>{row.old}</td>
                <td style={{ padding: "8px 10px" }}>{row.sw}</td>
                <td style={{ padding: "8px 10px", color: C.text2 }}>{row.newp}</td>
                <td style={{ padding: "8px 10px" }}>{row.m}</td>
                <td style={{ padding: "8px 10px", color: C.text2 }}>{row.w}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </MethodSection>

      <MethodSection title="Cohort Maturity Rules">
        <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.8, marginBottom: 8 }}>
          Downstream metrics (billing rate, active client rate) require <b style={{ color: C.text }}>42+ days</b> to stabilise. Meeting rate is readable immediately.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {[
              { status:"Mature ✓",    days:"42+ days",   note:"All rates readable and stable" },
              { status:"Partial ⏱",  days:"28–41 days", note:"Pipeline rate visible; active client rate immature" },
              { status:"Immature ⏱", days:"14–27 days", note:"Meeting rate visible; downstream too early" },
              { status:"In Progress", days:"< 14 days",  note:"No reliable metrics yet" },
            ].map(row => (
              <tr key={row.status} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                <td style={{ padding: "7px 10px", fontWeight: 500 }}>{row.status}</td>
                <td style={{ padding: "7px 10px", color: C.text2 }}>{row.days}</td>
                <td style={{ padding: "7px 10px", color: C.text2 }}>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </MethodSection>

      <MethodSection title="HubSpot Stage IDs and Query Logic">
        <div style={{ fontSize: 12, color: C.text2, marginBottom: 10, lineHeight: 1.7 }}>
          All metrics use <code style={{ background: C.bg2, padding: "1px 4px", borderRadius: 3 }}>hs_v2_date_entered_[stageId]</code> properties.
          Pipeline filter: <code style={{ background: C.bg2, padding: "1px 4px", borderRadius: 3 }}>pipeline = &apos;default&apos;</code> for all metrics except Active Client.
          Active Client queries run across <b style={{ color: C.text }}>all pipelines</b> — deals move to CS pipeline on placement.
          Valid lead filter: <code style={{ background: C.bg2, padding: "1px 4px", borderRadius: 3 }}>hs_v2_date_entered_appointmentscheduled HAS_PROPERTY</code>.
          Date filters use full ISO timestamps (e.g. 2026-05-01T00:00:00.000Z) to avoid midnight UTC cutoff issues.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {["Stage","Stage ID","Property"].map(h => (
                <th key={h} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em",
                  color: C.text2, fontWeight: 500, padding: "6px 10px",
                  textAlign: "left", borderBottom: `0.5px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Lead",                   "appointmentscheduled", "hs_v2_date_entered_appointmentscheduled"],
              ["Enrolled in Sequence",   "28807353",             "hs_v2_date_entered_28807353"],
              ["Zoom Call Booked",       "13542462",             "hs_v2_date_entered_13542462"],
              ["Parking Lot",            "1063655701",           "hs_v2_date_entered_1063655701"],
              ["Missed Zoom Call",       "28817239",             "hs_v2_date_entered_28817239"],
              ["Getting Billing Details","22600467",             "hs_v2_date_entered_22600467"],
              ["Recruiting",             "5423787",              "hs_v2_date_entered_5423787"],
              ["Resumes Sent",           "5568500",              "hs_v2_date_entered_5568500"],
              ["Interview Scheduled",    "12635527",             "hs_v2_date_entered_12635527"],
              ["Agreement Sent",         "13812915",             "hs_v2_date_entered_13812915"],
              ["Closed Lost",            "28817241",             "hs_v2_date_entered_28817241"],
              ["Active Client",          "12751919",             "hs_v2_date_entered_12751919"],
              ["DNC",                    "16160504",             "hs_v2_date_entered_16160504"],
            ].map(([stage, id, prop]) => (
              <tr key={id} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                <td style={{ padding: "7px 10px" }}>{stage}</td>
                <td style={{ padding: "7px 10px", fontFamily: "monospace", color: C.blue }}>{id}</td>
                <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: 11, color: C.text2 }}>{prop}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10, fontSize: 11, color: C.text2, lineHeight: 1.7 }}>
          <b style={{ color: C.text }}>Closed Won</b> = first entry to any of: Recruiting, Resumes Sent, Interview Scheduled, Agreement Sent.
          Query uses 4 filterGroups (OR logic), pipeline = default, valid lead filter.
          HubSpot deduplicates across filterGroups. 4 groups × 4 filters = 16 total filters (under HubSpot&apos;s 18-filter limit).<br/>
          <b style={{ color: C.text }}>Rebook rate</b> (Init 02): zoom booked date must be strictly <em>after</em> missed zoom date. Original booking is not counted.<br/>
          <b style={{ color: C.text }}>Parking Lot</b> (stage ID 1063655701): separated in all monthly metrics. Entry count in month — not current stage count.
        </div>
      </MethodSection>

      <MethodSection title="Data Exclusions">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {[
              { e:"Jeremy Levitt / Baden Bower", how:"Contact ID 9313151 excluded via contact association filter", r:"Partner — automated bulk enrollment skews sequence metrics" },
              { e:"Quick Jobs",                  how:"job.quick_job = true excluded from all job counts",           r:"Not standard placements" },
              { e:"Draft Jobs",                  how:"job.status = Draft excluded",                                  r:"Not finalized" },
              { e:"Outbound SDRs (Carlos, Paul, Christiaan, Kyle)", how:"Excluded from revenue attribution",        r:"Booking only — no closing responsibility" },
            ].map(row => (
              <tr key={row.e} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                <td style={{ padding: "8px 10px", fontWeight: 500, whiteSpace: "nowrap" }}>{row.e}</td>
                <td style={{ padding: "8px 10px", color: C.text2 }}>{row.how}</td>
                <td style={{ padding: "8px 10px", color: C.text2 }}>{row.r}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </MethodSection>

      <MethodSection title="Data Confidence Notes">
        <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.9 }}>
          <b style={{ color: C.text }}>Attended Call</b> is a proxy: Zoom Booked minus Missed Zoom entries in the month. Not a direct HubSpot property.<br/>
          <b style={{ color: C.text }}>Sub-stage counts</b> (Recruiting onwards) are directional — reps don&apos;t always update stages in sequence.<br/>
          <b style={{ color: C.text }}>Active Client</b> queries run across all pipelines — no pipeline filter applied.<br/>
          <b style={{ color: C.text }}>Benchmark variance</b>: allow ±5% for real-time data changes since confirmed numbers (June 3, 2026).<br/>
          Data refresh is manual. Click ↻ Refresh in the header to pull the latest from HubSpot.
        </div>
      </MethodSection>

      <div style={{ paddingTop: 12, borderTop: `0.5px solid ${C.border}`,
        fontSize: 11, color: C.text2, lineHeight: 1.7 }}>
        Data source: HubSpot CRM · Sales Pipeline (pipeline = &quot;default&quot;) · Timezone: SGT (UTC+8).<br/>
        Last data pull: <b>{new Date(data.lastRefreshed).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</b>.
        GitHub: github.com/vivianaveral/pipeline-optimization · Deployed on Railway.
      </div>
    </>
  );
}

function MethodSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `0.5px solid ${C.border}`, borderRadius: 10,
      padding: "16px 20px", marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10,
        paddingBottom: 8, borderBottom: `0.5px solid ${C.border}` }}>{title}</div>
      {children}
    </div>
  );
}
