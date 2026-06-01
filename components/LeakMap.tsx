"use client";
import type { HolisticMonthData } from "@/lib/hubspot";

interface Props { d: HolisticMonthData; }

function leakClass(rate: number): "red" | "amber" | "green" {
  if (rate > 70) return "red";
  if (rate > 50) return "amber";
  return "green";
}

function leakBg(rate: number): string {
  if (rate > 70) return "var(--dangerl)";
  if (rate > 50) return "var(--warnl)";
  return "var(--newl)";
}

function pct(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

interface NodeProps {
  label: string;
  count: number;
  isDestination?: boolean;
}
function Node({ label, count, isDestination }: NodeProps) {
  return (
    <div className={`leak-node${isDestination ? " active-client" : ""}`}>
      <span className="leak-node-lbl">{label}</span>
      <span className="leak-node-n" style={isDestination ? { color: "var(--new)", fontWeight: 700 } : {}}>
        {count.toLocaleString()}
      </span>
    </div>
  );
}

interface DropProps {
  entered: number;
  dropped: number;
  badges?: string[];
  note?: string;
}
function Drop({ entered, dropped, badges, note }: DropProps) {
  const rate = pct(dropped, entered);
  const cls  = leakClass(rate);
  if (entered === 0) return (
    <div style={{ height: 28, display: "flex", alignItems: "center" }}>
      <div style={{ width: 2, background: "var(--border)", height: "100%", margin: "0 18px" }} />
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      {/* vertical pipe */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 38, flexShrink: 0 }}>
        <div style={{ width: 2, background: "var(--border)", flex: 1 }} />
      </div>
      {/* drop info */}
      <div style={{ flex: 1, padding: "6px 0 6px 4px", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <div style={{
          background: leakBg(rate),
          border: `1px solid ${cls === "red" ? "#fca5a5" : cls === "amber" ? "#fcd34d" : "#a7f3d0"}`,
          borderRadius: 6,
          padding: "3px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
        }}>
          <span className={`leak-drop-pct ${cls}`}>{rate.toFixed(0)}% leak</span>
          <span style={{ color: "var(--muted)" }}>{dropped.toLocaleString()} CL</span>
        </div>
        {badges?.map((b) => (
          <span key={b} className="ini-badge">{b}</span>
        ))}
        {note && <span style={{ fontSize: 10, color: "var(--muted)" }}>{note}</span>}
      </div>
    </div>
  );
}

export default function LeakMap({ d }: Props) {
  const zoomIn  = d.zoom_booked;
  const pbIn    = d.pipeline_entered;
  const recIn   = d.recruiting          ?? 0;
  const resIn   = d.resumes_sent        ?? 0;
  const intIn   = d.interview_scheduled ?? 0;
  const agrIn   = d.agreement_sent      ?? 0;
  const acIn    = d.sp_active_client    ?? d.active_client;

  const clZoom  = d.cl_from_zoom         ?? 0;
  const clPb    = d.cl_from_pipeline     ?? 0;
  const clRec   = d.cl_from_recruiting   ?? 0;
  const clRes   = d.cl_from_resumes      ?? 0;
  const clInt   = d.cl_from_interview    ?? 0;
  const clAgr   = d.cl_from_agreement    ?? 0;
  const clAc    = d.cl_from_active       ?? 0;

  const seq     = d.enrolled_in_seq ?? 0;

  const legend = [
    { color: "var(--danger)", label: "> 70% leak rate — critical" },
    { color: "var(--warn)",   label: "50–70% leak rate — watch" },
    { color: "var(--new)",    label: "< 50% leak rate — healthy" },
  ];

  return (
    <div className="leak-wrap">
      <div className="sec-lbl">Where is the pipeline leaking?</div>

      <div className="leak-layout">
        {/* ── Flow column ── */}
        <div className="leak-flow" style={{ gap: 0 }}>

          {/* Calls Booked */}
          <Node label="Calls Booked" count={zoomIn} />

          {/* Branch: Enrolled in Sequence (no call) */}
          {seq > 0 && (
            <div style={{ display: "flex", alignItems: "stretch" }}>
              <div style={{ width: 38, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 2, background: "var(--border)", flex: 1 }} />
              </div>
              <div style={{ padding: "6px 0 6px 4px" }}>
                <div className="leak-branch-node">
                  <div>
                    <div style={{ fontWeight: 600 }}>Enrolled in Sequence (no call booked)</div>
                    <div style={{ color: "var(--muted)", marginTop: 1 }}>Form fill — no self-book</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginLeft: 12 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: "var(--old)" }}>{seq.toLocaleString()}</span>
                    <span className="ini-badge">Initiative 01</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Zoom → Pipeline drop */}
          <Drop
            entered={zoomIn}
            dropped={clZoom}
            badges={["Initiative 02", "Initiative 03"]}
            note="missed / no-show"
          />

          {/* Entered Pipeline */}
          <Node label="Entered Pipeline" count={pbIn} />

          {/* Pipeline → Recruiting drop */}
          <Drop
            entered={pbIn}
            dropped={clPb}
            badges={["Initiative 04"]}
            note="billing stall"
          />

          {/* Recruiting */}
          <Node label="Recruiting" count={recIn} />

          {/* Recruiting → Resumes drop */}
          <Drop entered={recIn} dropped={clRec} />

          {/* Resumes Sent */}
          <Node label="Resumes Sent" count={resIn} />

          {/* Resumes → Interview drop */}
          <Drop entered={resIn} dropped={clRes} />

          {/* Interview Scheduled */}
          <Node label="Interview Scheduled" count={intIn} />

          {/* Interview → Agreement drop */}
          <Drop entered={intIn} dropped={clInt} />

          {/* Agreement Sent */}
          <Node label="Agreement Sent" count={agrIn} />

          {/* Agreement → Active Client drop */}
          <Drop entered={agrIn} dropped={clAgr} />

          {/* Active Client — the number that matters */}
          <Node label="✓ Active Client" count={acIn} isDestination />
          {clAc > 0 && (
            <div style={{ paddingLeft: 38, paddingTop: 4 }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>
                {clAc} later closed lost after placement
              </span>
            </div>
          )}
        </div>

        {/* ── Legend column ── */}
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 12 }}>Leak rate guide</div>
            <div className="leak-legend">
              {legend.map(({ color, label }) => (
                <div key={label} className="leak-legend-item">
                  <div className="leak-legend-dot" style={{ background: color }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 12, marginTop: 20 }}>Initiative coverage</div>
          {[
            { id: "01", name: "Form Fill / No Call Booked", stage: "Enrolled in Sequence branch" },
            { id: "02", name: "Missed Zoom Call",           stage: "Calls Booked → Pipeline drop" },
            { id: "03", name: "TZ Rebook",                  stage: "Calls Booked → Pipeline drop" },
            { id: "04", name: "48hr Call Tasks",            stage: "Pipeline stall (billing)" },
          ].map(({ id, name, stage }) => (
            <div key={id} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid var(--border)", fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span className="ini-badge">Initiative {id}</span>
                <span style={{ fontWeight: 600 }}>{name}</span>
              </div>
              <div style={{ color: "var(--muted)", paddingLeft: 2 }}>{stage}</div>
            </div>
          ))}

          <div style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 7, fontSize: 10, color: "var(--muted)", lineHeight: 1.5, marginTop: 8 }}>
            Leak rate = closed lost ÷ entered stage. Cohort-based: anchored on lead entry date.
            Active Client uses all-pipeline count.
          </div>
        </div>
      </div>
    </div>
  );
}
