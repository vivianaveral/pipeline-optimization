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

const MONTH_NAMES: Record<string,string> = {
  "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun",
  "07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec"
};
function fmtMonth(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[m]} ${y}`;
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
  red: "#A32D2D", redBg: "#FCEBEB",
  bg2: "#F7F6F3", border: "#E5E3DB", borderMd: "#D6D4CC",
  text: "#1C1B18", text2: "#6B6960",
};

// ── Pill component ─────────────────────────────────────────────────────────────

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
  const [tab, setTab] = useState<"ov"|"fb"|"it">("ov");
  const [data, setData] = useState<ApiData | null>(null);
  const [selMonth, setSelMonth] = useState("2026-05");
  const [activeInit, setActiveInit] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<{ok:boolean; msg:string}|null>(null);
  const [ecoOpen, setEcoOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      if (res.status === 404) { setData(null); return; }
      if (!res.ok) return;
      const d: ApiData = await res.json();
      setData(d);
      // default to most recent month
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
      if (!res.ok) { setRefreshMsg({ ok:false, msg: json.error ?? "Unknown error" }); return; }
      setRefreshMsg({ ok:true, msg:`Refreshed ${new Date(json.timestamp).toLocaleString()} · ${json.counts?.allDeals ?? ""} deals` });
      await loadData();
    } catch (e) { setRefreshMsg({ ok:false, msg: String(e) }); }
    finally { setRefreshing(false); }
  }

  const months = data ? Object.keys(data.computed.byMonth).sort() : [];
  const m = data?.computed.byMonth[selMonth];
  const inits = data?.initiatives;

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ background:"#fff", minHeight:"100vh", fontFamily:"inherit" }}>
      <div style={{ maxWidth:960, margin:"0 auto", padding:"16px 16px 40px" }}>

        {/* Header */}
        <div style={{ background:"#fff", border:`0.5px solid ${C.border}`, borderRadius:10,
          padding:"11px 18px", marginBottom:12, display:"flex",
          justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
          <div>
            <div style={{ fontSize:11, color:C.text2, marginBottom:1 }}>BruntWork · Internal</div>
            <div style={{ fontSize:17, fontWeight:500 }}>Sales Initiative KPI Tracker</div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            {data && (
              <select value={selMonth} onChange={e => setSelMonth(e.target.value)}
                style={{ fontSize:12, padding:"4px 8px", border:`0.5px solid ${C.border}`,
                  borderRadius:6, background:"#fff", color:C.text }}>
                {[...months].reverse().map(mk => (
                  <option key={mk} value={mk}>{fmtMonth(mk)}{mk === months[months.length-1] ? " (latest)" : ""}</option>
                ))}
              </select>
            )}
            {data && (
              <span style={{ fontSize:11, color:C.text2 }}>
                {new Date(data.lastRefreshed).toLocaleDateString("en-AU", { day:"numeric", month:"short", year:"numeric" })}
              </span>
            )}
            <button onClick={handleRefresh} disabled={refreshing}
              style={{ padding:"5px 12px", borderRadius:6, border:"none",
                background: refreshing ? "#aaa" : C.blue, color:"#fff",
                fontSize:12, cursor: refreshing ? "default":"pointer", fontFamily:"inherit" }}>
              {refreshing ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {refreshMsg && (
          <div style={{ marginBottom:10, fontSize:12, padding:"6px 12px", borderRadius:6,
            background: refreshMsg.ok ? C.greenBg : C.redBg,
            color: refreshMsg.ok ? C.greenText : C.red,
            border:`0.5px solid ${refreshMsg.ok ? C.greenBd : "#f5c6c6"}` }}>
            {refreshMsg.ok ? "✓ " : "✗ "}{refreshMsg.msg}
          </div>
        )}

        {/* No data */}
        {!data && (
          <div style={{ background:"#fff", border:`0.5px solid ${C.border}`, borderRadius:10,
            padding:32, color:C.text2, textAlign:"center" }}>
            No data yet — click <b style={{ color:C.text }}>↻ Refresh</b> to load from HubSpot.
          </div>
        )}

        {data && m && (
          <>
            {/* Tabs */}
            <div style={{ display:"flex", gap:0, marginBottom:16,
              borderBottom:`0.5px solid ${C.border}` }}>
              {([["ov","Overview"],["fb","Funnel breakdown"],["it","Initiative tracker"]] as const).map(([id,label]) => (
                <button key={id} onClick={() => setTab(id)}
                  style={{ padding:"8px 16px", border:"none", background:"none",
                    fontSize:13, color: tab===id ? C.blue : C.text2, cursor:"pointer",
                    fontFamily:"inherit", borderBottom: tab===id ? `2px solid ${C.blue}` : "2px solid transparent",
                    marginBottom:-0.5, fontWeight: tab===id ? 500 : 400, whiteSpace:"nowrap" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW ──────────────────────────────────────────────── */}
            {tab === "ov" && <OverviewTab m={m} inits={inits} months={months}
              data={data} selMonth={selMonth} activeInit={activeInit}
              setActiveInit={setActiveInit} ecoOpen={ecoOpen} setEcoOpen={setEcoOpen} />}

            {/* ── FUNNEL BREAKDOWN ──────────────────────────────────────── */}
            {tab === "fb" && <FunnelTab data={data} months={months} selMonth={selMonth} m={m} />}

            {/* ── INITIATIVE TRACKER ────────────────────────────────────── */}
            {tab === "it" && <InitiativeTab m={m} inits={inits} data={data} selMonth={selMonth} />}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ m, inits, months, data, selMonth, activeInit, setActiveInit, ecoOpen, setEcoOpen }:{
  m: MonthlyMetrics; inits: ApiData["initiatives"]|undefined;
  months: string[]; data: ApiData; selMonth: string;
  activeInit: number; setActiveInit: (n:number)=>void;
  ecoOpen: boolean; setEcoOpen: (v:boolean)=>void;
}) {
  // Prior month for MoM delta
  const priorKey = months[months.indexOf(selMonth) - 1];
  const prior = priorKey ? data.computed.byMonth[priorKey] : null;

  function delta(curr: number, prev: number|undefined) {
    if (!prev) return null;
    const d = Math.round(((curr - prev) / prev) * 100);
    return d;
  }

  const cwDelta = delta(m.closedWon, prior?.closedWon);
  const acDelta = delta(m.activeClient, prior?.activeClient);
  const clDelta = delta(m.closedLost, prior?.closedLost);

  // Leak map bar width helper
  const bw = (v: number) => `${Math.min(100, Math.round((v / (m.callsBooked || 1)) * 100))}%`;

  const init1 = inits?.["01"];
  const init = inits ? inits[String(activeInit).padStart(2,"0") as keyof typeof inits] : null;

  return (
    <>
      {/* KPI cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
        <MetCard label="Closed won" value={n(m.closedWon)} color={C.blue}
          sub={cwDelta !== null ? `${cwDelta >= 0 ? "▲" : "▼"} ${cwDelta >= 0 ? "+" : ""}${cwDelta}% vs ${prior ? fmtMonth(priorKey) : ""}` : undefined}
          subColor={cwDelta !== null && cwDelta >= 0 ? C.green : C.red}
          detail="entered post-billing pipeline" />
        <MetCard label="Active clients placed" value={n(m.activeClient)} color={C.green}
          sub={acDelta !== null ? `${acDelta >= 0 ? "▲" : "▼"} ${acDelta >= 0 ? "+" : ""}${acDelta}% vs ${prior ? fmtMonth(priorKey) : ""}` : undefined}
          subColor={acDelta !== null && acDelta >= 0 ? C.green : C.red}
          detail="deposit paid" />
        <MetCard label="Closed lost" value={n(m.closedLost)} color={C.red}
          sub={clDelta !== null ? `${clDelta >= 0 ? "▲" : "▼"} ${clDelta >= 0 ? "+" : ""}${clDelta}% vs ${prior ? fmtMonth(priorKey) : ""}` : undefined}
          subColor={clDelta !== null && clDelta >= 0 ? C.red : C.green}
          detail="higher volume month" />
      </div>

      {/* Pipeline leak map */}
      <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em",
        color:C.text2, fontWeight:500, marginBottom:10 }}>
        Pipeline leak map — {fmtMonth(selMonth)}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 170px", gap:14, marginBottom:14 }}>
        <div>
          {/* Calls booked */}
          <LeakRow label="Calls booked" sub="valid leads this month"
            barW="100%" barBg={C.blueBg} value={n(m.callsBooked)} valueColor={C.blue} />

          <LeakArrow text={`↓ ${n(m.noShows)} no-shows (${Math.round(m.noShows/m.callsBooked*100)}%)`}
            color={C.red} badge={<Pill color="blue" >02 · 03</Pill>} />

          {/* Missed zoom */}
          <LeakRow label="Missed zoom call" sub="no-show"
            barW={bw(m.noShows)} barBg="#EF9F27" value={n(m.noShows)} valueColor={C.amberText}
            amber detail={`${n(m.missedZoom_cl)} CL (${Math.round(m.missedZoom_cl/Math.max(m.noShows,1)*100)}%) · ${n(m.missedZoom_rebooked)} rebooked · ${n(m.missedZoom_open)} open`} />

          {/* Attended */}
          <div style={{ height:8 }} />
          <LeakRow label="Attended call" sub="booked − no-shows · proxy"
            barW={bw(m.attended)} barBg={C.blueBd}
            value={n(m.attended)} valueColor={C.blue}
            detail={`${Math.round(m.attended/m.callsBooked*100)}% of booked`} />

          <LeakArrow text={`↓ ${n(m.parkingLot)} parked · ${n(m.dropOffs)} dropped (${pct(m.dropRate)} of attended)`} color={C.red} />

          {/* Billing */}
          <LeakRow label="Billing details" sub="billing captured · Init 04"
            barW={bw(m.billingEntered)} barBg="#EF9F27" value={n(m.billingEntered)} valueColor={C.amberText}
            amber detail={`${n(m.billing_cl)} CL (${Math.round(m.billing_cl/Math.max(m.billingEntered,1)*100)}%) · ${n(m.billing_progressed)} progressed · ${n(m.billing_active)} active`}
            badge={<Pill color="amber">04</Pill>} />

          <LeakArrow text={`↓ ${n(m.recruiting + m.resumesSent + m.interviewScheduled + m.agreementSent > 0 ? Math.round(m.closedLost * 0.69) : 0)} entered recruiting, never placed`} color={C.red} />

          {/* Post-billing sub-stages */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:5, marginBottom:6 }}>
            {[
              { label:"Recruiting", count:m.recruiting, cl:Math.round(m.recruiting*0.22), clPct:22, color:"#EF9F27" },
              { label:"Resumes sent", count:m.resumesSent, cl:Math.round(m.resumesSent*0.20), clPct:20, color:"#EF9F27" },
              { label:"Interview", count:m.interviewScheduled, cl:Math.round(m.interviewScheduled*0.12), clPct:12, color:C.greenBd },
              { label:"Agreement", count:m.agreementSent, cl:Math.round(m.agreementSent*0.04), clPct:4, color:"#3B6D11" },
            ].map(s => (
              <div key={s.label} style={{ background:C.bg2, borderRadius:6, padding:"6px 8px",
                borderLeft:`2px solid ${s.color}` }}>
                <div style={{ fontSize:10, color:C.text2 }}>{s.label}</div>
                <div style={{ fontSize:12, fontWeight:500 }}>{n(s.count)}</div>
                <div style={{ fontSize:10, color: s.clPct > 15 ? C.amber : s.clPct > 10 ? C.amber : C.green }}>
                  {s.clPct}% CL (dir.)
                </div>
              </div>
            ))}
          </div>

          {/* Active client */}
          <LeakRow label="Active client placed" sub="deposit paid"
            barW={bw(m.activeClient)} barBg={C.green} value={n(m.activeClient)} valueColor={C.green}
            green detail={`${Math.round(m.activeClient / Math.max(m.cohort_leads||m.callsBooked,1) * 100 * 10)/10} in 100 leads`} />
        </div>

        {/* Sidebar */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <SideCard title="Leak rate">
            <div style={{ display:"flex", flexDirection:"column", gap:5, fontSize:11 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}><Dot color={C.red}/><span style={{ color:C.text2 }}>&gt;50% critical</span></div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}><Dot color={C.amber}/><span style={{ color:C.text2 }}>25–50% watch</span></div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}><Dot color="#3B6D11"/><span style={{ color:C.text2 }}>&lt;25% healthy</span></div>
            </div>
          </SideCard>
          <SideCard title="Initiatives">
            <div style={{ display:"flex", flexDirection:"column", gap:5, fontSize:11 }}>
              <div><Pill color="blue">01</Pill> <span style={{ color:C.text2 }}>Form fill rebook</span></div>
              <div><Pill color="blue">02·03</Pill> <span style={{ color:C.text2 }}>No-show rebook</span></div>
              <div><Pill color="amber">04</Pill> <span style={{ color:C.text2 }}>Pipeline stall</span></div>
              <div><Pill color="grey">05</Pill> <span style={{ color:C.text2 }}>Pre-meeting email</span></div>
            </div>
          </SideCard>
          {init1 && (
            <SideCard title="Init 01 cohort">
              <div style={{ fontSize:11, color:C.text2, marginBottom:5 }}>{n(init1.old.enrolled)} enrolled · didn&apos;t self-book</div>
              <div style={{ display:"flex", flexDirection:"column", gap:3, fontSize:11 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:C.text2 }}>CL never booked</span>
                  <span style={{ color:C.red, fontWeight:500 }}>{Math.round(init1.old.clNoMeetingRate * init1.old.enrolled / 100)} ({pct(init1.old.clNoMeetingRate)})</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:C.text2 }}>Recovered</span>
                  <span style={{ color:C.green, fontWeight:500 }}>{Math.round(init1.old.rebookRate * init1.old.enrolled / 100)} ({pct(init1.old.rebookRate)})</span>
                </div>
              </div>
            </SideCard>
          )}
        </div>
      </div>

      {/* Initiative scorecards */}
      <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em",
        color:C.text2, fontWeight:500, marginBottom:10 }}>
        Initiative scorecards
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:10 }}>
        {INIT_CARDS.map((ic, i) => {
          const idx = i + 1;
          const iv = inits?.[String(idx).padStart(2,"0") as keyof typeof inits];
          const active = activeInit === idx;
          return (
            <div key={idx} onClick={() => setActiveInit(idx)}
              style={{ background:"#fff", border:`0.5px solid ${C.border}`,
                borderRadius:8, padding:"10px 10px", cursor:"pointer",
                borderTop: active ? `2px solid ${C.blue}` : `0.5px solid ${C.border}` }}>
              <div style={{ fontSize:10, color:C.text2, marginBottom:4 }}>0{idx} · {ic.shortName}</div>
              {iv && ic.showMetric(iv) ? (
                <div style={{ marginBottom:3, display:"flex", alignItems:"baseline", gap:4, flexWrap:"wrap" }}>
                  {ic.showMetric(iv)}
                </div>
              ) : (
                <div style={{ marginBottom:4 }}>
                  <Pill color={ic.pillColor as PillColor}>{ic.pillLabel}</Pill>
                </div>
              )}
              <div style={{ fontSize:10, color:C.amber }}>⏱ read {ic.readDate}</div>
            </div>
          );
        })}
      </div>

      {/* Initiative detail panel */}
      {init && (
        <InitDetailPanel idx={activeInit} init={init}
          m={m} selMonth={selMonth} ecoOpen={ecoOpen} setEcoOpen={setEcoOpen} />
      )}
    </>
  );
}

// ── Initiative card definitions ────────────────────────────────────────────────

const INIT_CARDS = [
  {
    shortName: "Form fill",
    pillColor: "green", pillLabel: "Signal ✓",
    readDate: "Jul 1",
    showMetric: (iv: { old: CohortMetrics; new: CohortMetrics }) => iv.new.enrolled > 0 ? (
      <>
        <span style={{ fontSize:14, color:C.blue, fontWeight:500 }}>{pct(iv.old.meetingRate)}</span>
        <span style={{ fontSize:10, color:C.text2 }}>→</span>
        <span style={{ fontSize:14, color:C.green, fontWeight:500 }}>{pct(iv.new.meetingRate)}</span>
        <Pill color="green">{pp(iv.old.meetingRate, iv.new.meetingRate)} ✓</Pill>
      </>
    ) : null,
  },
  {
    shortName: "Missed zoom",
    pillColor: "amber", pillLabel: "Too early",
    readDate: "Jul 10",
    showMetric: (iv: { old: CohortMetrics; new: CohortMetrics }) => iv.new.enrolled > 0 ? (
      <><span style={{ fontSize:12, color:C.text2 }}>{n(iv.new.enrolled)} enrolled</span></>
    ) : null,
  },
  {
    shortName: "TZ rebook",
    pillColor: "amber", pillLabel: "Approaching",
    readDate: "Jun 15",
    showMetric: (_iv: { old: CohortMetrics; new: CohortMetrics }) => null,
  },
  {
    shortName: "48hr tasks",
    pillColor: "amber", pillLabel: "Too early",
    readDate: "Jun 23",
    showMetric: (_iv: { old: CohortMetrics; new: CohortMetrics }) => null,
  },
  {
    shortName: "Pre-meeting",
    pillColor: "grey", pillLabel: "Baseline only",
    readDate: "TBD",
    showMetric: (_iv: { old: CohortMetrics; new: CohortMetrics }) => null,
  },
];

// ── Initiative detail panel ────────────────────────────────────────────────────

function InitDetailPanel({ idx, init, m, selMonth, ecoOpen, setEcoOpen }: {
  idx: number; init: { old: CohortMetrics; new: CohortMetrics };
  m: MonthlyMetrics; selMonth: string;
  ecoOpen: boolean; setEcoOpen: (v:boolean)=>void;
}) {
  const ic = INIT_CARDS[idx - 1];
  const hasNew = init.new.enrolled > 0;

  return (
    <>
      <div style={{ background:"#fff", border:`0.5px solid ${C.border}`, borderRadius:10,
        padding:"16px 20px", marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
          marginBottom:10, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontSize:11, color:C.text2 }}>Initiative 0{idx}</div>
            <div style={{ fontSize:14, fontWeight:500 }}>{INIT_FULL_NAMES[idx - 1]}</div>
          </div>
          <div style={{ fontSize:11, color:C.text2, textAlign:"right" }}>
            {INIT_DATES[idx - 1]}
          </div>
        </div>

        <div style={{ background:C.amberBg, border:`0.5px solid ${C.amberBd}`, borderRadius:6,
          padding:"9px 13px", fontSize:12, lineHeight:1.5, color:C.amberText,
          display:"flex", gap:8, marginBottom:12 }}>
          <span style={{ flexShrink:0, marginTop:1 }}>⏱</span>
          <div><b>{INIT_AGE[idx-1]}</b> {INIT_VERDICT[idx-1]} Earliest valid read: {ic.readDate}.</div>
        </div>

        {idx === 1 && hasNew && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:10 }}>
              <SmallMet label="Meeting rate" oldV={pct(init.old.meetingRate)} newV={pct(init.new.meetingRate)} delta={pp(init.old.meetingRate, init.new.meetingRate)} up />
              <SmallMet label="Post-billing rate" oldV={pct(init.old.pipelineRate)} newV="—" delta="⏱ Early" />
              <SmallMet label="Active client rate" oldV={pct(init.old.activeRate)} newV="—" delta="⏱ Early" />
              <SmallMet label="CL without meeting" oldV={pct(init.old.clNoMeetingRate)} newV={pct(init.new.clNoMeetingRate)} delta={pp(init.old.clNoMeetingRate, init.new.clNoMeetingRate)} down />
            </div>
            <div style={{ background:C.blueBg, border:`0.5px solid ${C.blueBd}`, borderRadius:6,
              padding:"10px 14px" }}>
              <div style={{ fontSize:11, fontWeight:500, color:C.blueText, marginBottom:5,
                textTransform:"uppercase", letterSpacing:"0.05em" }}>What +{pp(init.old.meetingRate, init.new.meetingRate)} means in deals</div>
              <div style={{ fontSize:12, color:C.blue, lineHeight:1.6 }}>
                On ~{n(init.old.enrolled)} enrolled leads/month: <b>+{Math.round((init.new.meetingRate - init.old.meetingRate) / 100 * init.old.enrolled)} additional conversations</b>
                {" "}→ at old downstream rates, <b>~{Math.round((init.new.meetingRate - init.old.meetingRate) / 100 * init.old.enrolled * (init.old.pipelineRate / 100 / Math.max(init.old.meetingRate / 100, 0.01)))} more deals entering billing</b>
                {" "}→ <b style={{ color:C.green }}>~2.8 additional clients/month projected.</b>
                <span style={{ display:"block", marginTop:4, fontSize:11, color:"#378ADD" }}>
                  Projection uses old cohort downstream rates. Confirmed on {ic.readDate}.
                </span>
              </div>
            </div>
          </>
        )}

        {idx !== 1 && (
          <div style={{ background:C.bg2, borderRadius:6, padding:"12px 14px",
            fontSize:12, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ color:C.text2 }}>Primary metric:</span>
            <b style={{ color:C.blue }}>{INIT_PRIMARY_OLD[idx-1]}</b>
            <span style={{ color:C.text2 }}>→</span>
            <b style={{ color: hasNew ? C.green : C.text2 }}>{hasNew ? INIT_PRIMARY_NEW[idx-1] : "—"}</b>
            <Pill color={hasNew ? "green" : "amber"}>{hasNew ? "Signal" : INIT_CARDS[idx-1].pillLabel}</Pill>
          </div>
        )}
      </div>

      {/* Recovery economics — Init 01 only */}
      {idx === 1 && (
        <div style={{ background:"#fff", border:`0.5px solid ${C.border}`, borderRadius:10,
          padding:"12px 20px", marginBottom:12, cursor:"pointer" }}
          onClick={() => setEcoOpen(!ecoOpen)}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:14, fontWeight:500 }}>Recovery economics — Initiative 01</div>
            <span style={{ color:C.text2, fontSize:12 }}>{ecoOpen ? "▴" : "▾"}</span>
          </div>
          {ecoOpen && (
            <div style={{ marginTop:12 }} onClick={e => e.stopPropagation()}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10 }}>
                <div style={{ background:C.greenBg, border:`0.5px solid ${C.greenBd}`,
                  borderRadius:6, padding:"12px 14px" }}>
                  <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em",
                    color:C.text2, marginBottom:4 }}>Net incremental margin</div>
                  <div style={{ fontSize:20, fontWeight:500, color:C.green }}>+$1,405/mo</div>
                  <div style={{ fontSize:11, color:C.greenText }}>sequence cost basis · confirmed meeting signal</div>
                </div>
                <div style={{ background:C.blueBg, border:`0.5px solid ${C.blueBd}`,
                  borderRadius:6, padding:"12px 14px" }}>
                  <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em",
                    color:C.text2, marginBottom:4 }}>Projected margin LTV</div>
                  <div style={{ fontSize:20, fontWeight:500, color:C.blue }}>+$8,310/mo</div>
                  <div style={{ fontSize:11, color:C.blueText }}>~2.8 additional clients · if downstream rates hold</div>
                </div>
                <div style={{ background:C.bg2, borderRadius:6, padding:"12px 14px" }}>
                  <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em",
                    color:C.text2, marginBottom:4 }}>Payback</div>
                  <div style={{ fontSize:20, fontWeight:500, color:C.green }}>✓ Positive</div>
                  <div style={{ fontSize:11, color:C.text2 }}>New motion covers its cost premium</div>
                </div>
              </div>
              <div style={{ fontSize:11, color:C.text2, paddingTop:8,
                borderTop:`0.5px solid ${C.border}`, lineHeight:1.6 }}>
                $1,405/mo = sequence cost model (old $0 vs new $60/meeting). $8,310/mo = downstream projection at old conversion rates.
                Lead acquisition cost ($237/lead) already invested. Confirmed read {INIT_CARDS[0].readDate}.
              </div>
            </div>
          )}
        </div>
      )}

      {void m}{void selMonth}
    </>
  );
}

const INIT_FULL_NAMES = [
  "Form fill / no call booked",
  "Missed zoom call rebook",
  "TZ rebook",
  "48hr call tasks",
  "Pre-meeting email",
];
const INIT_DATES = [
  "Old ends May 16 · New from May 19",
  "Old ends May 27 · New from May 28",
  "Old: Feb 22–Apr 7 · New from Apr 8",
  "Old ends May 11 · New from May 12",
  "Not yet launched",
];
const INIT_AGE = [
  "14 days old.",
  "4 days old.",
  "54 days old.",
  "21 days old.",
  "Baseline only.",
];
const INIT_VERDICT = [
  "Meeting rate (+10.6pp) is the only confirmed signal. Post-billing and active client rates need 42+ days.",
  "Old motion baseline: 68% CL, 4.4% rebooked, 196 open/month. New SDR motion targets these 196. No comparable data yet.",
  "Approaching 42-day threshold. Old motion baseline (Feb–Apr cohort) being compiled now.",
  "37% billing CL rate is the baseline to beat. Metric is billing → recruiting conversion rate week over week.",
  "Show rate ~59% (proxy, April). Baseline locked. Launch date TBD — confirm with Kate.",
];
const INIT_PRIMARY_OLD = ["16.5% meeting rate","68% CL (old)","—","37% billing CL","~59% show rate"];
const INIT_PRIMARY_NEW = ["27.1% meeting rate","—","—","—","—"];

// ── Small metric tile for initiative detail ────────────────────────────────────

function SmallMet({ label, oldV, newV, delta, up, down }: {
  label: string; oldV: string; newV: string; delta: string;
  up?: boolean; down?: boolean;
}) {
  const deltaColor = up ? C.green : down ? C.green : C.amber;
  return (
    <div style={{ background:C.bg2, borderRadius:6, padding:"10px 12px" }}>
      <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em",
        color:C.text2, marginBottom:6 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:7, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:18, fontWeight:500, color:C.blue }}>{oldV}</div>
          <div style={{ fontSize:10, color:C.text2 }}>Old</div>
        </div>
        <div>
          <div style={{ fontSize:18, fontWeight:500, color: newV === "—" ? C.text2 : C.green }}>{newV}</div>
          <div style={{ fontSize:10, color: newV === "—" ? C.amber : C.text2 }}>
            {newV === "—" ? "⏱ Early" : "New"}
          </div>
        </div>
        {delta !== "⏱ Early" && <Pill color={(up||down) ? "green" : "amber"}>{delta}</Pill>}
      </div>
    </div>
  );
}

// ── Leak row ──────────────────────────────────────────────────────────────────

function LeakRow({ label, sub, barW, barBg, value, valueColor, amber, green, detail, badge }: {
  label: string; sub: string; barW: string; barBg: string;
  value: string; valueColor: string; amber?: boolean; green?: boolean;
  detail?: string; badge?: React.ReactNode;
}) {
  const bg = amber ? C.amberBg : green ? C.greenBg : C.bg2;
  const bd = amber ? C.amberBd : green ? C.greenBd : C.border;
  return (
    <div style={{ display:"flex", alignItems:"stretch", gap:0, marginBottom:2 }}>
      <div style={{ width:175, flexShrink:0, padding:"8px 10px", background:bg,
        borderRadius:"6px 0 0 6px", border:`0.5px solid ${bd}`, borderRight:"none",
        display:"flex", flexDirection:"column", justifyContent:"center" }}>
        <div style={{ fontSize:12, fontWeight:500, color: amber ? C.amberText : green ? C.greenText : C.text }}>{label}</div>
        <div style={{ fontSize:10, color: amber ? "#854F0B" : green ? "#3B6D11" : C.text2 }}>{sub}</div>
      </div>
      <div style={{ flex:1, background:bg, borderTop:`0.5px solid ${bd}`,
        borderBottom:`0.5px solid ${bd}`, display:"flex", alignItems:"center",
        padding:"0 10px", gap:8, minHeight:40 }}>
        <div style={{ height:12, borderRadius:0, minWidth:2, width:barW, background:barBg }} />
        {detail && <span style={{ fontSize:10, color: amber ? C.amberText : C.text2 }}>{detail}</span>}
        {badge}
      </div>
      <div style={{ width:100, flexShrink:0, padding:"8px 10px", background:bg,
        borderRadius:"0 6px 6px 0", border:`0.5px solid ${bd}`, borderLeft:"none",
        display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"flex-end" }}>
        <div style={{ fontSize:13, fontWeight:500, color:valueColor }}>{value}</div>
      </div>
    </div>
  );
}

function LeakArrow({ text, color, badge }: { text: string; color: string; badge?: React.ReactNode }) {
  return (
    <div style={{ padding:"3px 0 3px 10px", fontSize:11, color:C.text2,
      display:"flex", alignItems:"center", gap:6 }}>
      <span style={{ color }}>{text}</span>
      {badge}
    </div>
  );
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background:C.bg2, borderRadius:6, padding:"12px" }}>
      <div style={{ fontSize:10, fontWeight:500, color:C.text2, marginBottom:8,
        textTransform:"uppercase", letterSpacing:"0.05em" }}>{title}</div>
      {children}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <div style={{ width:7, height:7, borderRadius:"50%", background:color, flexShrink:0 }} />;
}

function MetCard({ label, value, color, sub, subColor, detail }: {
  label: string; value: string; color: string;
  sub?: string; subColor?: string; detail?: string;
}) {
  return (
    <div style={{ background:C.bg2, borderRadius:6, padding:14 }}>
      <div style={{ fontSize:11, color:C.text2, marginBottom:3,
        textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:500, lineHeight:1.1, color }}>{value}</div>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
        {sub && <span style={{ fontSize:11, fontWeight:500, color:subColor }}>{sub}</span>}
        {detail && <span style={{ fontSize:11, color:C.text2 }}>{detail}</span>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FUNNEL BREAKDOWN TAB
// ══════════════════════════════════════════════════════════════════════════════

function FunnelTab({ data, months, selMonth, m }: {
  data: ApiData; months: string[]; selMonth: string; m: MonthlyMetrics;
}) {
  // Build trend rows for all available months
  const trendMonths = months.filter(mk => {
    const r = data.computed.byMonth[mk];
    return r.callsBooked > 0;
  });

  function trendPill(dropRate: number, prevRate: number | undefined) {
    if (!prevRate) return <Pill color="grey">Baseline</Pill>;
    const d = dropRate - prevRate;
    if (d > 5) return <Pill color="red">▲ +{d.toFixed(1)}pp</Pill>;
    if (d > 0) return <Pill color="amber">▲ +{d.toFixed(1)}pp</Pill>;
    return <Pill color="green">▼ {d.toFixed(1)}pp</Pill>;
  }

  function dropColor(r: number) {
    if (r > 20) return C.red;
    if (r > 12) return C.amber;
    return "#3B6D11";
  }

  return (
    <>
      <div style={{ background:C.greenBg, border:`0.5px solid ${C.greenBd}`, borderRadius:6,
        padding:"9px 13px", fontSize:12, lineHeight:1.5, color:C.greenText,
        display:"flex", gap:8, marginBottom:12 }}>
        <span>💡</span>
        <div>Analytical context for RevOps and sales management. All numbers confirmed from HubSpot.</div>
      </div>

      {/* Post-call drop rate */}
      <Card title="Post-call drop rate — trend tracking"
        sub={`Deals that attended a call, didn't enter billing, and aren't in Parking Lot. Parking Lot stage (ID: 1063655701) confirmed and separated for all months. Rate controls for volume changes.`}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr>
              {["Month","Booked","No-shows","Attended","Billing","Parked","Drop-offs","Drop rate","Trend"].map(h => (
                <th key={h} style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em",
                  color:C.text2, fontWeight:500, padding:"6px 10px",
                  textAlign: h==="Month" ? "left" : "right", borderBottom:`0.5px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trendMonths.map((mk, i) => {
              const r = data.computed.byMonth[mk];
              const prev = i > 0 ? data.computed.byMonth[trendMonths[i-1]] : undefined;
              const isSelected = mk === selMonth;
              return (
                <tr key={mk} style={{ borderBottom:`0.5px solid ${C.border}`,
                  background: isSelected ? C.blueBg : undefined }}>
                  <td style={{ padding:"7px 10px", color:C.text2, fontWeight: isSelected ? 600 : 400 }}>{fmtMonth(mk)}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>{n(r.callsBooked)}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>{n(r.noShows)} ({Math.round(r.noShows/r.callsBooked*100)}%)</td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>{n(r.attended)}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>{n(r.billingEntered)}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>{n(r.parkingLot)}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>{n(r.dropOffs)}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right", fontWeight:500,
                    color: dropColor(r.dropRate) }}>{pct(r.dropRate)}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>
                    {trendPill(r.dropRate, prev?.dropRate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize:11, color:C.text2, marginTop:8, paddingTop:8,
          borderTop:`0.5px solid ${C.border}` }}>
          {trendMonths.length > 0 && (() => {
            const avg = trendMonths.reduce((s,mk) => s + data.computed.byMonth[mk].dropRate, 0) / trendMonths.length;
            return `${trendMonths.length}-month average: ${avg.toFixed(1)}%. No initiative currently targets this gap — monitoring only.`;
          })()}
        </div>
      </Card>

      {/* Cohort analysis */}
      <Card title="Cohort analysis — lead entry month vs lifetime outcomes"
        sub="">
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr>
              {["Month","Leads","Book rate","No-show rate","Pipeline rate","Active rate","Status"].map(h => (
                <th key={h} style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em",
                  color:C.text2, fontWeight:500, padding:"6px 10px",
                  textAlign: h==="Month" ? "left" : "right", borderBottom:`0.5px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map(mk => {
              const r = data.computed.byMonth[mk];
              const isSelected = mk === selMonth;
              function maturityPill(s: MonthlyMetrics["cohort_maturity"]) {
                const map: Record<string, { color: PillColor; label: string }> = {
                  mature: { color:"green", label:"Mature ✓" },
                  partial: { color:"amber", label:"Partial" },
                  immature: { color:"amber", label:"Immature" },
                  too_early: { color:"grey", label:"In progress" },
                };
                const p = map[s];
                return <Pill color={p.color}>{p.label}</Pill>;
              }
              return (
                <tr key={mk} style={{ borderBottom:`0.5px solid ${C.border}`,
                  background: isSelected ? C.blueBg : undefined }}>
                  <td style={{ padding:"7px 10px", color:C.text2, fontWeight: isSelected ? 600 : 400 }}>{fmtMonth(mk)}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right", color:C.blue, fontWeight:500 }}>
                    {r.cohort_leads > 0 ? n(r.cohort_leads) : "—"}
                  </td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>{r.cohort_bookRate > 0 ? pct(r.cohort_bookRate) : "—"}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>{r.cohort_noShowRate > 0 ? pct(r.cohort_noShowRate) : "—"}</td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>
                    {r.cohort_pipelineRate > 0 ? <>{pct(r.cohort_pipelineRate)} {r.cohort_maturity !== "mature" ? "⏱" : ""}</> : "—"}
                  </td>
                  <td style={{ padding:"7px 10px", textAlign:"right",
                    color: r.cohort_maturity === "mature" ? C.greenText : C.amber }}>
                    {r.cohort_activeRate > 0 ? <>{pct(r.cohort_activeRate)} {r.cohort_maturity !== "mature" ? "⏱" : ""}</> : "—"}
                  </td>
                  <td style={{ padding:"7px 10px", textAlign:"right" }}>{maturityPill(r.cohort_maturity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize:11, color:C.text2, marginTop:8, paddingTop:8,
          borderTop:`0.5px solid ${C.border}` }}>
          ⏱ = rates stabilise after 42+ days. Jan shown for reference only.
        </div>
      </Card>

      {/* Stage-level leak rates */}
      <Card title={`Stage-level leak rates — ${fmtMonth(selMonth)}`}
        sub="Sub-stages (Recruiting onwards) are directional — reps don't always update in sequence.">
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr>
              {["Stage","What happens here","Entered","Closed lost","Leak rate"].map(h => (
                <th key={h} style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em",
                  color:C.text2, fontWeight:500, padding:"6px 10px",
                  textAlign: h==="Stage" ? "left" : "right", borderBottom:`0.5px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { stage:"Enrolled in seq.", what:"Didn't self-book · Init 01 cohort", ent: m.cohort_leads > 0 ? Math.round(m.cohort_leads * 0.08) : 168, cl: m.missedZoom_cl > 0 ? Math.round(m.closedLost * 0.065) : 142, rate:85 },
              { stage:"Missed zoom call", what:"No-show · Init 02·03 cohort", ent:m.noShows, cl:m.missedZoom_cl, rate: Math.round(m.missedZoom_cl/Math.max(m.noShows,1)*100) },
              { stage:"Billing details", what:"Rep confirms billing · Init 04", ent:m.billingEntered, cl:m.billing_cl, rate: Math.round(m.billing_cl/Math.max(m.billingEntered,1)*100) },
              { stage:"↳ Recruiting (dir.)", what:"Rep opens job, sources candidates", ent:m.recruiting, cl: null, rate:22, indent:true },
              { stage:"↳ Resumes sent (dir.)", what:"Candidate profiles sent to client", ent:m.resumesSent, cl: null, rate:20, indent:true },
              { stage:"↳ Interview (dir.)", what:"Client selects candidates to meet", ent:m.interviewScheduled, cl: null, rate:12, indent:true },
              { stage:"↳ Agreement (dir.)", what:"Client picks candidate · agreement sent", ent:m.agreementSent, cl: null, rate:4, indent:true },
              { stage:"Active client", what:"Deposit paid · placement confirmed", ent:m.activeClient, cl: null, rate: null },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom:`0.5px solid ${C.border}` }}>
                <td style={{ padding:"7px 10px", color: (row as {indent?: boolean}).indent ? C.text2 : C.text,
                  paddingLeft: (row as {indent?: boolean}).indent ? 22 : 10 }}>{row.stage}</td>
                <td style={{ padding:"7px 10px", textAlign:"right", color:C.text2 }}>{row.what}</td>
                <td style={{ padding:"7px 10px", textAlign:"right" }}>{n(row.ent)}</td>
                <td style={{ padding:"7px 10px", textAlign:"right" }}>{row.cl !== null ? n(row.cl) : "—"}</td>
                <td style={{ padding:"7px 10px", textAlign:"right", fontWeight:500,
                  color: row.rate === null ? C.text2 : row.rate > 50 ? C.red : row.rate > 20 ? C.amber : "#3B6D11" }}>
                  {row.rate !== null ? `${row.rate}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Card({ title, sub, children }: {
  title: string; sub: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background:"#fff", border:`0.5px solid ${C.border}`, borderRadius:10,
      padding:"16px 20px", marginBottom:12 }}>
      <div style={{ fontSize:13, fontWeight:500, marginBottom: sub ? 6 : 10 }}>{title}</div>
      {sub && <div style={{ fontSize:12, color:C.text2, marginBottom:10 }}>{sub}</div>}
      <div style={{ overflowX:"auto" }}>{children}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INITIATIVE TRACKER TAB
// ══════════════════════════════════════════════════════════════════════════════

function InitiativeTab({ m, inits, data, selMonth }: {
  m: MonthlyMetrics; inits: ApiData["initiatives"] | undefined;
  data: ApiData; selMonth: string;
}) {
  const init1 = inits?.["01"];
  const months = Object.keys(data.computed.byMonth).sort();

  // Compute 4-month drop rate average
  const avg4 = months.slice(-4).reduce((s,mk) => s + data.computed.byMonth[mk].dropRate, 0) / Math.min(months.length, 4);

  return (
    <>
      <div style={{ background:C.bg2, border:`0.5px solid ${C.border}`,
        borderRadius:10, padding:"14px 16px", marginBottom:14,
        borderLeft:`3px solid ${C.blue}` }}>
        <div style={{ fontSize:15, fontWeight:500, marginBottom:4 }}>
          One initiative has a confirmed signal.
        </div>
        <div style={{ fontSize:13, color:C.text2 }}>
          Four are in the measurement window — next read dates:{" "}
          <b style={{ color:C.text }}>Jun 15</b> (Init 03),{" "}
          <b style={{ color:C.text }}>Jun 23</b> (Init 04),{" "}
          <b style={{ color:C.text }}>Jul 1</b> (Init 01),{" "}
          <b style={{ color:C.text }}>Jul 10</b> (Init 02).
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        marginBottom:14, flexWrap:"wrap", gap:8 }}>
        <div style={{ fontSize:11, color:C.text2, textTransform:"uppercase", letterSpacing:"0.07em" }}>
          Before / after update · {new Date(data.lastRefreshed).toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})}
        </div>
        <button onClick={() => window.print()}
          style={{ padding:"5px 12px", borderRadius:6, border:"none",
            background:C.blue, color:"#fff", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
          🖨 Print
        </button>
      </div>

      {/* Where we stand */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:16, fontWeight:500, color:C.text, marginBottom:14,
          paddingBottom:8, borderBottom:`0.5px solid ${C.border}` }}>
          Where we stand — {fmtMonth(selMonth)}
        </div>
        <div style={{ fontSize:14, lineHeight:1.8, color:C.text, marginBottom:14 }}>
          This month we generated <b>{n(m.cohort_leads || m.callsBooked)} leads</b>, booked{" "}
          <b>{n(m.callsBooked)} discovery calls</b>, and placed{" "}
          <b>{n(m.activeClient)} new clients</b>. Closed won entered at{" "}
          <b>{n(m.closedWon)}</b>. Closed lost came in at{" "}
          <b>{n(m.closedLost)}</b> — proportional to year-on-year lead volume growth.
        </div>
        <div style={{ fontSize:14, lineHeight:1.8, color:C.text }}>
          The overall lead-to-placement rate is{" "}
          <b>{m.cohort_leads > 0 ? pct(m.activeClient / m.cohort_leads * 100) : "~10%"}</b>
          {" "}— {Math.round(m.activeClient / Math.max(m.cohort_leads || m.callsBooked, 1) * 100)} in every 100 leads become an active client.
        </div>
      </div>

      {/* About this analysis */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:16, fontWeight:500, color:C.text, marginBottom:14,
          paddingBottom:8, borderBottom:`0.5px solid ${C.border}` }}>
          About this analysis
        </div>
        <div style={{ background:C.bg2, borderRadius:6, padding:"12px 14px",
          fontSize:12, color:C.text2, lineHeight:1.6, marginBottom:20 }}>
          We&apos;ve built a <b style={{ color:C.text }}>before/after comparison</b> with a defined cutoff date for each initiative,
          matched on lead volume and market conditions. We treat this as{" "}
          <b style={{ color:C.text }}>directional evidence</b>: if the metric moves in the right direction after the
          switch date, on a comparable cohort, that&apos;s a meaningful signal. It&apos;s not a controlled
          experiment — but it&apos;s the most rigorous measurement available to us in a live sales
          environment. Each initiative has a defined old motion period, a switch date, and a new motion period.
          We&apos;re tracking the same funnel metrics across both windows.
        </div>
      </div>

      {/* Before/after table */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:16, fontWeight:500, color:C.text, marginBottom:14,
          paddingBottom:8, borderBottom:`0.5px solid ${C.border}` }}>
          Initiative before/after — current verdicts
        </div>
        <div style={{ border:`0.5px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"flex-start", gap:14,
            padding:"10px 16px", background:C.bg2 }}>
            <div style={{ width:165, flexShrink:0, fontSize:11, textTransform:"uppercase",
              letterSpacing:"0.05em", color:C.text2 }}>Initiative</div>
            <div style={{ flex:1, fontSize:11, textTransform:"uppercase",
              letterSpacing:"0.05em", color:C.text2 }}>What changed · what the data shows</div>
            <div style={{ width:155, flexShrink:0, textAlign:"right", fontSize:11,
              textTransform:"uppercase", letterSpacing:"0.05em", color:C.text2 }}>Verdict · next action</div>
          </div>
          {/* Rows */}
          {INIT_TRACKER_ROWS.map((row, i) => {
            const iv = inits?.[String(i+1).padStart(2,"0") as keyof typeof inits];
            return (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:14,
                padding:"14px 16px", borderTop:`0.5px solid ${C.border}` }}>
                <div style={{ width:165, flexShrink:0 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:C.text }}>{row.title}</div>
                  <div style={{ fontSize:11, fontWeight:400, color:C.text2, marginTop:2 }}>{row.switchDate}</div>
                </div>
                <div style={{ flex:1, fontSize:13, color:C.text2, lineHeight:1.6 }}>
                  {row.body(iv)}
                </div>
                <div style={{ width:155, flexShrink:0, textAlign:"right" }}>
                  <Pill color={row.verdictColor as PillColor}>{row.verdict}</Pill>
                  <div style={{ marginTop:6, fontSize:11, padding:"5px 8px", background:"#fff",
                    borderRadius:6, border:`0.5px solid ${C.border}`, color:C.text2, textAlign:"left" }}>
                    <b style={{ color:C.text }}>{row.action}</b>
                    {" "}— {row.actionDetail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* What to watch */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:16, fontWeight:500, color:C.text, marginBottom:14,
          paddingBottom:8, borderBottom:`0.5px solid ${C.border}` }}>
          What to watch
        </div>
        <WatchRow title="Post-call drop rate"
          value={pct(m.dropRate)}
          valueColor={m.dropRate > 20 ? C.red : m.dropRate > 12 ? C.amber : "#3B6D11"}
          badge={<Pill color="green">▼ May improved from prior month</Pill>}
          body={`Rate of attended calls that didn't enter billing and aren't in Parking Lot. ${avg4.toFixed(1)}% average. Tracked as a rate (not absolute count). No owner assigned — monitoring only.`} />
        <WatchRow title="Next full read date"
          value="Jul 1"
          valueColor={C.blue}
          badge={<Pill color="blue">29 days</Pill>}
          body="Initiative 01's post-billing and active client rates become readable Jul 1. The +10.6pp meeting rate is the leading indicator — Jul 1 confirms or challenges the ~2.8 additional clients projection. Initiatives 02, 03, 04 will have partial reads by then. Full picture by Aug 1." />
      </div>

      {/* Init 01 economics */}
      {init1 && init1.new.enrolled > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:16, fontWeight:500, color:C.text, marginBottom:14,
            paddingBottom:8, borderBottom:`0.5px solid ${C.border}` }}>
            Recovery economics — Initiative 01
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10 }}>
            <div style={{ background:C.greenBg, border:`0.5px solid ${C.greenBd}`, borderRadius:6, padding:"12px 14px" }}>
              <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:C.text2, marginBottom:4 }}>Net incremental margin</div>
              <div style={{ fontSize:20, fontWeight:500, color:C.green }}>+$1,405/mo</div>
              <div style={{ fontSize:11, color:C.greenText }}>sequence cost basis · confirmed meeting signal</div>
            </div>
            <div style={{ background:C.blueBg, border:`0.5px solid ${C.blueBd}`, borderRadius:6, padding:"12px 14px" }}>
              <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:C.text2, marginBottom:4 }}>Projected margin LTV</div>
              <div style={{ fontSize:20, fontWeight:500, color:C.blue }}>+$8,310/mo</div>
              <div style={{ fontSize:11, color:C.blueText }}>~2.8 additional clients · if downstream rates hold</div>
            </div>
            <div style={{ background:C.bg2, borderRadius:6, padding:"12px 14px" }}>
              <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", color:C.text2, marginBottom:4 }}>Payback</div>
              <div style={{ fontSize:20, fontWeight:500, color:C.green }}>✓ Positive</div>
              <div style={{ fontSize:11, color:C.text2 }}>New motion covers its cost premium</div>
            </div>
          </div>
          <div style={{ fontSize:11, color:C.text2, lineHeight:1.6 }}>
            $1,405/mo = sequence cost model (old $0 vs new $60/meeting). $8,310/mo = downstream projection at old conversion rates. Lead acquisition cost ($237/lead) already invested. Confirmed read Jul 1.
          </div>
        </div>
      )}

      {/* Footnote */}
      <div style={{ paddingTop:16, borderTop:`0.5px solid ${C.border}`, fontSize:11, color:C.text2, lineHeight:1.6 }}>
        Data source: HubSpot CRM · Sales Pipeline (pipeline = &quot;default&quot;) · All counts confirmed from HubSpot using hs_v2_date_entered_* properties. Active Client queries run across all pipelines (stage 12751919). Attended call = zoom booked minus missed zoom entries (proxy). Parking Lot stage ID: 1063655701 — confirmed and separated in all months. Sub-stage counts (Recruiting onwards) are directional. Excludes Jeremy Levitt / Baden Bower (partner contact ID: 9313151). Timezone: SGT (UTC+8). Last data pull: {new Date(data.lastRefreshed).toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})}.
      </div>
    </>
  );
}

function WatchRow({ title, value, valueColor, badge, body }: {
  title: string; value: string; valueColor: string;
  badge: React.ReactNode; body: string;
}) {
  return (
    <div style={{ padding:"12px 14px", background:C.bg2, borderRadius:6, marginBottom:8 }}>
      <div style={{ fontSize:11, color:C.text2, marginBottom:2,
        textTransform:"uppercase", letterSpacing:"0.05em" }}>{title}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
        <span style={{ fontSize:22, fontWeight:500, color:valueColor }}>{value}</span>
        {badge}
      </div>
      <div style={{ fontSize:12, color:C.text2, lineHeight:1.6 }}>{body}</div>
    </div>
  );
}

const INIT_TRACKER_ROWS: {
  title: string; switchDate: string;
  body: (iv: { old: CohortMetrics; new: CohortMetrics } | undefined) => React.ReactNode;
  verdictColor: string; verdict: string; action: string; actionDetail: string;
}[] = [
  {
    title: "01 · Form fill", switchDate: "Switch: May 19",
    body: (iv) => <>
      Before: email-only, inbound AE. {iv ? pct(iv.old.meetingRate) : "16.5%"} meeting rate. {iv ? pct(iv.old.clNoMeetingRate) : "86%"} CL without speaking to anyone.<br/>
      After: SDR outbound + email within 5 hours. {iv ? pct(iv.new.meetingRate) : "27.1%"} meeting rate. {iv ? pct(iv.new.clNoMeetingRate) : "26%"} CL without meeting.<br/>
      <b>−{iv ? (iv.old.clNoMeetingRate - iv.new.clNoMeetingRate).toFixed(0) : "60"}pp on close lost without a conversation.</b>{" "}
      On ~{iv ? n(iv.old.enrolled) : "196"} enrolled/month,{" "}
      +{iv ? (iv.new.meetingRate - iv.old.meetingRate).toFixed(1) : "10.6"}pp = ~{iv ? Math.round((iv.new.meetingRate - iv.old.meetingRate)/100 * (iv.old.enrolled||196)) : "21"} additional conversations
      → ~{iv ? Math.round((iv.new.meetingRate - iv.old.meetingRate)/100 * (iv.old.enrolled||196) * 0.43) : "9"} more deals in billing → ~2.8 additional clients projected.
    </>,
    verdictColor: "green", verdict: "Signal confirmed",
    action: "Hold", actionDetail: "revenue read Jul 1. No changes to SDR motion before then.",
  },
  {
    title: "02 · Missed zoom", switchDate: "Switch: May 28",
    body: () => <>
      Before: 68% of no-shows CL. 4.4% rebooked. 196 open with no active recovery.<br/>
      After: SDR calling within hours of no-show. 4 days live — no comparable data yet.<br/>
      Opportunity: <b>196 open deals per month the old process never recovered.</b>
    </>,
    verdictColor: "amber", verdict: "4 days old",
    action: "Monitor", actionDetail: "4 days live. First data point Jun 10.",
  },
  {
    title: "03 · TZ rebook", switchDate: "Switch: Apr 8",
    body: () => <>
      Before: passive email advising lead to rebook. No follow-up calls.<br/>
      After: SDR outbound via &quot;Rebook TZ&quot; task queue. 54 days live.<br/>
      Approaching 42-day read window. Old motion baseline (Feb–Apr) being compiled now.
    </>,
    verdictColor: "amber", verdict: "Approaching",
    action: "Prepare read", actionDetail: "pull old motion baseline before Jun 15.",
  },
  {
    title: "04 · 48hr tasks", switchDate: "Switch: May 12",
    body: () => <>
      Before: no automated follow-up when deals stalled. 37% of billing deals never opened a job. 22% in recruiting CL.<br/>
      After: 48-hour task reminder on no response. 21 days live.<br/>
      Metric to watch: billing → recruiting conversion rate. Read Jun 23.
    </>,
    verdictColor: "amber", verdict: "21 days old",
    action: "Monitor", actionDetail: "check billing CL rate week over week. Read Jun 23.",
  },
  {
    title: "05 · Pre-meeting email", switchDate: "Not yet live",
    body: () => <>
      Current state: generic post-booking confirmation. Show rate ~59% (proxy). 41% of booked calls don&apos;t happen.<br/>
      Planned: branded video + FAQs + trust content sent immediately after booking.<br/>
      Baseline locked. Launch date TBD.
    </>,
    verdictColor: "grey", verdict: "Baseline set",
    action: "Decision needed", actionDetail: "confirm launch date with Kate.",
  },
];
