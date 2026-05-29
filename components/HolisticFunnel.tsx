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
  // "2026-05" → "May 2026"
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-AU", { month: "long", year: "numeric" });
}

export default function HolisticFunnel({ data, allowedMonths }: Props) {
  // All months present in the fetched data, newest first
  const allMonths = Object.keys(data).sort().reverse();

  // Scope to period if active; intersection with what's actually in data
  const months = allowedMonths
    ? allMonths.filter((m) => allowedMonths.includes(m))
    : allMonths;

  const [selectedMonth, setSelectedMonth] = useState(months[0] ?? "");

  // When the allowed set changes (period switch), snap to the most recent valid month
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
  const zoomPct   = (d.zoom_booked      / lead) * 100;
  const pbPct     = (d.pipeline_entered  / lead) * 100;
  const activePct = (d.active_client     / lead) * 100;
  const dropRate  = d.zoom_booked > 0
    ? ((d.zoom_booked - d.pipeline_entered) / d.zoom_booked) * 100
    : 0;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ marginBottom: 0 }}>Full Sales Pipeline — Holistic Funnel</h3>

        {/* Month selector — hidden when period pins to a single month */}
        {months.length > 1 ? (
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>{fmtMonth(m)}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
            {fmtMonth(months[0])}
          </span>
        )}
      </div>

      <FBar pctVal={100}      name="Lead (form fill)"                        stat={d.lead.toLocaleString()}                                     color="rgba(37,99,235,.10)" />
      <FBar pctVal={zoomPct}  name="↳ Zoom Call Booked"                      stat={`${d.zoom_booked.toLocaleString()} · ${zoomPct.toFixed(1)}%`} color="rgba(37,99,235,.18)" />
      <FBar pctVal={pbPct}    name="↳ Entered Pipeline (first post-billing)"  stat={`${d.pipeline_entered.toLocaleString()} · ${pbPct.toFixed(1)}%`} color="rgba(5,150,105,.15)" />
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
      <FBar pctVal={d.cl_never_met   > 0 ? (d.cl_never_met   / lead) * 100 : 0} name="Never booked a meeting" stat={d.cl_never_met.toLocaleString()}    color="rgba(220,38,38,.10)" />
      <FBar pctVal={d.cl_booked_no_place > 0 ? (d.cl_booked_no_place / lead) * 100 : 0} name="Booked, didn't place"   stat={d.cl_booked_no_place.toLocaleString()} color="rgba(220,38,38,.18)" />
    </div>
  );
}
