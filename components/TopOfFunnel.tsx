"use client";
import type { HolisticMonthData } from "@/lib/hubspot";

interface Props { d: HolisticMonthData; }

function Stage({ n, label, color = "var(--text)" }: { n: number; label: string; color?: string }) {
  return (
    <div className="tof-stage">
      <div className="tof-stage-n" style={{ color }}>{n.toLocaleString()}</div>
      <div className="tof-stage-lbl">{label}</div>
    </div>
  );
}

function Arrow({ rate, label }: { rate: number; label?: string }) {
  return (
    <div className="tof-arrow">
      <span className="tof-rate">{rate.toFixed(0)}%</span>
      <div style={{ display: "flex", alignItems: "center", width: "100%", padding: "0 4px" }}>
        <div style={{ flex: 1, borderTop: "2px solid var(--border)" }} />
        <span style={{ fontSize: 10, color: "var(--muted)" }}>▶</span>
      </div>
      {label && <span style={{ fontSize: 9, color: "var(--muted)" }}>{label}</span>}
    </div>
  );
}

export default function TopOfFunnel({ d }: Props) {
  const lead    = d.lead    || 1;
  const zoom    = d.zoom_booked;
  const seq     = d.enrolled_in_seq ?? 0;

  const leadToZoom = (zoom / lead) * 100;
  const leadToSeq  = seq > 0 ? (seq / lead) * 100 : 0;

  return (
    <div className="tof-wrap">
      <div className="sec-lbl">Top of funnel — where leads go</div>

      {/* Main flow: Leads → Calls Booked */}
      <div className="tof-flow">
        <Stage n={lead} label="Leads (form fill)" />
        <Arrow rate={leadToZoom} />
        <Stage n={zoom} label="Calls Booked" color="var(--old)" />
      </div>

      {/* Branch: Enrolled in Sequence (no call) */}
      {seq > 0 && (
        <div className="tof-branch">
          <div style={{ paddingTop: 4 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: "var(--oldl)", color: "var(--old)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>01</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
              of {lead.toLocaleString()} leads, <strong style={{ color: "var(--text)" }}>{leadToSeq.toFixed(0)}%</strong> enrolled in sequence without booking a call
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                background: "var(--oldl)",
                border: "1px solid var(--oldm)",
                borderRadius: 7,
                padding: "8px 14px",
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "var(--old)", lineHeight: 1 }}>
                  {seq.toLocaleString()}
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  Enrolled in Sequence (no call)
                </span>
              </div>
              <div>
                <span className="ini-badge" style={{ marginRight: 4 }}>Initiative 01</span>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                  Form Fill / No Call Booked
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
