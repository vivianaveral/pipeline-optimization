"use client";
import type { MotionMetrics } from "@/lib/hubspot";

interface Props {
  old: MotionMetrics;
  newData: MotionMetrics;
}

function pct(v: number) {
  return v.toFixed(1) + "%";
}

function Delta({ nv, ov, lowerBetter = false }: { nv: number; ov: number; lowerBetter?: boolean }) {
  if (nv === 0 && !newData) return <span className="badge early">⏱ early</span>;
  const d = nv - ov;
  const better = lowerBetter ? d < 0 : d > 0;
  const cls = better ? "up" : "down";
  const sign = d > 0 ? "+" : "";
  return <span className={`badge ${cls}`}>{sign}{d.toFixed(1)}pp</span>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function newData() { return null; }

function KPICard({
  label,
  oldVal,
  newVal,
  note,
  lowerBetter = false,
  newMature,
}: {
  label: string;
  oldVal: number;
  newVal: number;
  note: string;
  lowerBetter?: boolean;
  newMature: boolean;
}) {
  const showNew = newMature || label.includes("Meeting") || label.includes("CL");
  const d = newVal - oldVal;
  const better = lowerBetter ? d < 0 : d > 0;
  const sign = d > 0 ? "+" : "";

  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="lbl">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div className="big blue">{pct(oldVal)}</div>
          <div className="sub">Old process</div>
        </div>
        <div>
          <div className="big green">{showNew ? pct(newVal) : "—"}</div>
          <div className="sub">New initiative</div>
        </div>
        {showNew ? (
          <span className={`badge ${better ? "up" : "down"}`}>
            {sign}{d.toFixed(1)}pp
          </span>
        ) : (
          <span className="badge early">⏱ early</span>
        )}
      </div>
      <div className="sub" style={{ marginTop: 4, fontSize: "10px" }}>{note}</div>
    </div>
  );
}

export default function KPICards({ old, newData }: Props) {
  return (
    <div className="row4">
      <KPICard
        label="Enroll → Meeting Rate"
        oldVal={old.enroll_to_meeting_pct}
        newVal={newData.enroll_to_meeting_pct}
        note="Leading indicator — matures in days"
        newMature={newData.is_mature}
      />
      <KPICard
        label="Enroll → Post-Billing"
        oldVal={old.enroll_to_pipeline_pct}
        newVal={newData.enroll_to_pipeline_pct}
        note="Valid read after 42-day window"
        newMature={newData.is_mature}
      />
      <KPICard
        label="Enroll → Active Client"
        oldVal={old.enroll_to_active_pct}
        newVal={newData.enroll_to_active_pct}
        note="Revenue quality — lagging"
        newMature={newData.is_mature}
      />
      <KPICard
        label="CL Without Meeting"
        oldVal={old.cl_no_meeting_pct}
        newVal={newData.cl_no_meeting_pct}
        note="Lower = more leads recovered"
        lowerBetter
        newMature={newData.is_mature}
      />
    </div>
  );
}
