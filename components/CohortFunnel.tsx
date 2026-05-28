"use client";
import type { MotionMetrics } from "@/lib/hubspot";

interface Props {
  old: MotionMetrics;
  newData: MotionMetrics;
}

function pct(v: number) {
  return v.toFixed(1) + "%";
}

function FBar({
  color,
  pctVal,
  name,
  stat,
  indent = false,
}: {
  color: "old" | "new" | "danger" | "gray";
  pctVal: number;
  name: string;
  stat: string;
  indent?: boolean;
}) {
  const rgb =
    color === "old" ? "37,99,235" : color === "new" ? "5,150,105" : color === "danger" ? "220,38,38" : "156,163,175";
  const w = Math.min(Math.max(pctVal, 0.5), 100);

  return (
    <div className={indent ? "fb-indent" : ""}>
      <div className="fb">
        <div
          className="fb-fill"
          style={{ width: `${w}%`, background: `rgba(${rgb},.12)` }}
        />
        <div className="fb-lbl">
          <span>{name}</span>
          <span style={{ color: "var(--muted)", fontSize: "10px" }}>{stat}</span>
        </div>
      </div>
    </div>
  );
}

function MotionCard({ d, cls }: { d: MotionMetrics; cls: "old" | "new" }) {
  const n = d.enrolled;
  const im = !d.is_mature;
  const tag = im ? " ⏱" : "";
  const label = cls === "old" ? "Old process" : "New initiative";

  return (
    <div className={`motion-card ${cls}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span className={`badge ${cls}`}>{label}</span>
        <span style={{ fontSize: "11px", color: "var(--muted)" }}>
          {n.toLocaleString()} enrolled
        </span>
      </div>

      <div className="sdiv">Progression</div>
      <FBar color={cls} pctVal={100} name="Enrolled" stat={n.toLocaleString()} />
      <FBar
        color={cls}
        pctVal={d.enroll_to_meeting_pct}
        name="↳ Meeting Booked"
        stat={`${d.meetings_booked} · ${pct(d.enroll_to_meeting_pct)}`}
        indent
      />
      <FBar
        color={cls}
        pctVal={d.enroll_to_pipeline_pct}
        name={`↳ Post-Billing${tag}`}
        stat={`${d.pipeline_entered} · ${pct(d.enroll_to_pipeline_pct)}`}
        indent
      />
      <FBar
        color={cls}
        pctVal={Math.max(d.enroll_to_active_pct, 0.3)}
        name={`↳ Active Client${tag}`}
        stat={`${d.active_client} · ${pct(d.enroll_to_active_pct)}`}
        indent
      />

      <div className="sdiv">Closed Lost breakdown</div>
      <FBar
        color="danger"
        pctVal={d.cl_no_meeting_pct}
        name="CL — never reached meeting"
        stat={`${d.cl_never_met} · ${pct(d.cl_no_meeting_pct)}`}
      />
      <FBar
        color="danger"
        pctVal={Math.max(n > 0 ? (d.cl_booked_no_pipeline / n) * 100 : 0, 0.3)}
        name="CL — after meeting, before pipeline"
        stat={`${d.cl_booked_no_pipeline}`}
      />
      <FBar
        color="danger"
        pctVal={Math.max(n > 0 ? (d.cl_pipeline_no_place / n) * 100 : 0, 0.3)}
        name="CL — after pipeline entry"
        stat={`${d.cl_pipeline_no_place}`}
      />

      <div className="sdiv">Still open</div>
      <FBar
        color="gray"
        pctVal={Math.max(n > 0 ? (d.still_open / n) * 100 : 0, 0.3)}
        name="In sequence / open"
        stat={`${d.still_open}`}
      />
    </div>
  );
}

export default function CohortFunnel({ old, newData }: Props) {
  return (
    <div className="row2">
      <MotionCard d={old} cls="old" />
      <MotionCard d={newData} cls="new" />
    </div>
  );
}
