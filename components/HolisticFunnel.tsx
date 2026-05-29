"use client";
import { useState, useEffect } from "react";
import type { HolisticMonthData } from "@/lib/hubspot";

interface Props {
  data: Record<string, HolisticMonthData>;
  // Months the active period spans (e.g. ["2026-04","2026-05"]).
  // null = "All data" — show full dropdown with all available months.
  allowedMonths: string[] | null;
}

function FBar({ pctVal, name, stat, color }: { pctVal: number; name: string; stat: string; color: string }) {
  const w = Math.min(Math.max(pctVal, 0.5), 100);
  return (
    <div className="fb" style={{ marginBottom: 4 }}>
      <div className="fb-fill" style={{ width: `${w}%`, background: color }} />
      <div className="fb-lbl">
        <span>{name}</span>
        <span style={{ color: "var(--muted)", fontSize: "10px" }}>{stat}</span>
      </div>
    </div>
  );
}

function fmtMonth(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-AU", { month: "long", year: "numeric" });
}

export default function HolisticFunnel({ data, allowedMonths }: Props) {
  const allMonths = Object.keys(data).sort().reverse();

  const months = allowedMonths
    ? allMonths.filter((m) => allowedMonths.includes(m))
    : allMonths;

  const [selectedMonth, setSelectedMonth] = useState(months[0] ?? "");

  useEffect(() => {
    if (months.length > 0 && !months.includes(selectedMonth)) {
      setSelectedMonth(months[0]);
    }
  }, [months, selectedMonth]);

  if (allMonths.length === 0) return null;

  if (months.length === 0) {
    return (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ marginBottom: 0 }}>Full Sales Pipeline — Holistic Funnel</h3>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          No holistic data available for this period yet. Click Refresh to load HubSpot data.
        </p>
      </div>
    );
  }

  const d = data[selectedMonth];
  if (!d) return null;

  const lead = d.lead || 1;
  const zoomPct   = (d.zoom_booked     / lead) * 100;
  const pbPct     = (d.pipeline_entered / lead) * 100;
  const activePct = (d.active_client    / lead) * 100;
  const dropRate  = d.zoom_booked > 0
    ? ((d.zoom_booked - d.pipeline_entered) / d.zoom_booked) * 100
    : 0;

  const monthSelector = months.length > 1 ? (
    <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
      {months.map((m) => (
        <option key={m} value={m}>{fmtMonth(m)}</option>
      ))}
    </select>
  ) : (
    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{fmtMonth(months[0])}</span>
  );

  return (
    <>
      {/* ── Holistic Funnel ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ marginBottom: 0 }}>Full Sales Pipeline — Holistic Funnel</h3>
          {monthSelector}
        </div>

        <FBar pctVal={100}       name="Lead (form fill)"                       stat={d.lead.toLocaleString()}                                      color="rgba(37,99,235,.10)" />
        <FBar pctVal={zoomPct}   name="↳ Zoom Call Booked"                     stat={`${d.zoom_booked.toLocaleString()} · ${zoomPct.toFixed(1)}%`}  color="rgba(37,99,235,.18)" />
        <FBar pctVal={pbPct}     name="↳ Entered Pipeline (first post-billing)" stat={`${d.pipeline_entered.toLocaleString()} · ${pbPct.toFixed(1)}%`} color="rgba(5,150,105,.15)" />
        <FBar pctVal={activePct} name="↳ Active Client (placed)"               stat={`${d.active_client.toLocaleString()} · ${activePct.toFixed(1)}%`} color="rgba(5,150,105,.25)" />

        <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 11, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>
            Zoom → Active Client:{" "}
            {d.zoom_booked > 0 ? ((d.active_client / d.zoom_booked) * 100).toFixed(1) : "—"}%
          </strong>
          {"  ·  "}
          Implied drop rate (no-show + didn't convert): {dropRate.toFixed(1)}% of Zoom-booked leads
        </div>

        <div className="sdiv">Closed Lost</div>
        <FBar pctVal={d.cl_never_met      > 0 ? (d.cl_never_met      / lead) * 100 : 0} name="Never booked a meeting" stat={d.cl_never_met.toLocaleString()}       color="rgba(220,38,38,.10)" />
        <FBar pctVal={d.cl_booked_no_place > 0 ? (d.cl_booked_no_place / lead) * 100 : 0} name="Booked, didn't place" stat={d.cl_booked_no_place.toLocaleString()} color="rgba(220,38,38,.18)" />
      </div>

      {/* ── Pipeline Leak Analysis — same month as funnel above ── */}
      <PipelineLeakAnalysis d={d} monthLabel={fmtMonth(selectedMonth)} />
    </>
  );
}

// ─── Pipeline Leak Analysis ──────────────────────────────────────────────────

function leakBg(rate: number, directional?: boolean): string {
  if (directional) return "transparent";
  if (rate > 70) return "#fef2f2";
  if (rate > 50) return "#fffbeb";
  return "transparent";
}
function leakFg(rate: number, directional?: boolean): string {
  if (directional) return "var(--muted)";
  if (rate > 70) return "#991b1b";
  if (rate > 50) return "#92400e";
  return "inherit";
}

interface LeakRow {
  name: string;
  entered: number;
  cl: number;
  indent?: boolean;
  directional?: boolean;
}

function PipelineLeakAnalysis({ d, monthLabel }: { d: HolisticMonthData; monthLabel: string }) {
  const rows: LeakRow[] = [
    { name: "Lead",                  entered: d.lead,                      cl: d.cl_from_lead     ?? 0 },
    { name: "Enrolled in Sequence",  entered: d.enrolled_in_seq      ?? 0, cl: d.cl_from_enrolled ?? 0 },
    { name: "Zoom Call Booked",      entered: d.zoom_booked,               cl: d.cl_from_zoom     ?? 0 },
    { name: "Post-Billing (total)",  entered: d.pipeline_entered,          cl: d.cl_from_pipeline ?? 0 },
    { name: "↳ Recruiting",          entered: d.recruiting           ?? 0, cl: d.cl_from_recruiting  ?? 0, indent: true, directional: true },
    { name: "↳ Resumes Sent",        entered: d.resumes_sent         ?? 0, cl: d.cl_from_resumes     ?? 0, indent: true, directional: true },
    { name: "↳ Interview Scheduled", entered: d.interview_scheduled  ?? 0, cl: d.cl_from_interview   ?? 0, indent: true, directional: true },
    { name: "↳ Agreement Sent",      entered: d.agreement_sent       ?? 0, cl: d.cl_from_agreement   ?? 0, indent: true, directional: true },
    { name: "Active Client",         entered: d.active_client,             cl: d.cl_from_active   ?? 0 },
  ];

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ marginBottom: 0 }}>Pipeline Leak Analysis</h3>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{monthLabel}</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border)" }}>
            <th style={{ textAlign: "left",  padding: "6px 8px", fontWeight: 600, color: "var(--muted)", fontSize: 11 }}>Stage</th>
            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: "var(--muted)", fontSize: 11 }}>Entered</th>
            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: "var(--muted)", fontSize: 11 }}>Closed Lost</th>
            <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: "var(--muted)", fontSize: 11 }}>Leak Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rate = row.entered > 0 ? (row.cl / row.entered) * 100 : 0;
            return (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: leakBg(rate, row.directional) }}>
                <td style={{
                  padding: "6px 8px",
                  paddingLeft: row.indent ? 24 : 8,
                  color: row.indent ? "var(--muted)" : "inherit",
                  fontStyle: row.directional ? "italic" : "normal",
                }}>
                  {row.name}
                  {row.directional && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.6 }}>directional</span>}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.entered.toLocaleString()}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.cl.toLocaleString()}</td>
                <td style={{
                  padding: "6px 8px",
                  textAlign: "right",
                  fontWeight: !row.directional && rate > 50 ? 600 : 400,
                  color: leakFg(rate, row.directional),
                }}>
                  {row.entered > 0 ? rate.toFixed(1) + "%" : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 10, marginBottom: 0, fontStyle: "italic" }}>
        Leak rate = closed lost ÷ entered stage. Amber = &gt;50%, red = &gt;70%.{" "}
        Sub-stage counts are directional — reps don&apos;t always update these in sequence.
      </p>
    </div>
  );
}
