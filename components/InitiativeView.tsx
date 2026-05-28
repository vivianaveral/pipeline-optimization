"use client";
import type { Initiative } from "@/config/initiatives";
import type { MotionMetrics, HolisticMonthData } from "@/lib/hubspot";
import KPICards from "./KPICards";
import CohortFunnel from "./CohortFunnel";
import WeeklyChart from "./WeeklyChart";
import OutcomeMixChart from "./OutcomeMixChart";
import ROIModule from "./ROIModule";
import HolisticFunnel from "./HolisticFunnel";

interface Props {
  initiative: Initiative;
  old: MotionMetrics;
  newData: MotionMetrics;
  holistic: Record<string, HolisticMonthData>;
}

export default function InitiativeView({ initiative, old, newData, holistic }: Props) {
  const cohortAgeDays = newData.cohort_age_days;
  const isImmature = !newData.is_mature && cohortAgeDays < newData.maturity_threshold_days;
  const notLaunched = initiative.notYetLaunched;

  const newFrom = initiative.newMotion.dateFrom !== "TBD" ? initiative.newMotion.dateFrom : null;
  const oldTo = initiative.oldMotion.dateTo && initiative.oldMotion.dateTo !== "TBD"
    ? initiative.oldMotion.dateTo
    : null;

  return (
    <div>
      {/* Header */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
              Initiative {initiative.id}
            </p>
            <h1>
              {initiative.oldMotion.label}{" "}
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>vs</span>{" "}
              {initiative.newMotion.label}
            </h1>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
              {initiative.oldMotion.description} vs {initiative.newMotion.description}
            </p>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
            {oldTo && <div>Old process ends: {oldTo}</div>}
            {newFrom && <div>New initiative from: {newFrom}</div>}
          </div>
        </div>
      </div>

      {/* Maturity banner */}
      {isImmature && !notLaunched && (
        <div className="banner warn">
          <span className="bicon">⏱</span>
          <div>
            <strong>New initiative cohort is {cohortAgeDays} days old.</strong> Meeting rate is the only reliable early
            signal. Post-billing and Active Client rates need {newData.maturity_threshold_days}+ days.
            Earliest valid read: ~{getMaturityDate(newFrom, newData.maturity_threshold_days)}.
          </div>
        </div>
      )}

      {/* Not launched banner */}
      {notLaunched && (
        <div className="banner info">
          <span className="bicon">ℹ</span>
          <div>
            <strong>Initiative not yet launched.</strong> Showing baseline metrics only. Dashboard will update
            automatically once launch date is configured and refresh is run.
          </div>
        </div>
      )}

      {/* Recovery framing */}
      {!notLaunched && (
        <div className="banner tip">
          <span className="bicon">↩</span>
          <div>
            <strong>Recovery framing:</strong> These leads already paid for themselves via ad spend (~$237/lead).
            The initiative converts leads that otherwise close lost — every placement is recovered margin.
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {!notLaunched && <KPICards old={old} newData={newData} />}

      {/* Holistic Funnel */}
      {Object.keys(holistic).length > 0 && <HolisticFunnel data={holistic} />}

      {/* Cohort Funnel */}
      {!notLaunched && <CohortFunnel old={old} newData={newData} />}

      {/* Charts */}
      {!notLaunched && old.weekly.length > 0 && (
        <div className="row2">
          <WeeklyChart old={old} newData={newData} />
          <OutcomeMixChart old={old} newData={newData} />
        </div>
      )}

      {/* ROI Module */}
      {!notLaunched && (
        <ROIModule
          old={old}
          newData={newData}
          defaultCostOld={initiative.oldMotion.seqCostPerMeeting}
          defaultCostNew={initiative.newMotion.seqCostPerMeeting}
        />
      )}

      {/* Footnotes */}
      <Footnotes initiative={initiative} />
    </div>
  );
}

function getMaturityDate(from: string | null, days: number): string {
  if (!from) return "TBD";
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

function Footnotes({ initiative }: { initiative: Initiative }) {
  const rows: Array<[string, string]> = [
    ["Enrollment anchor", `hs_v2_date_entered_${initiative.entryProperty?.replace("hs_v2_date_entered_", "") ?? initiative.entryStages?.[0].property.replace("hs_v2_date_entered_", "") ?? ""} — stable, doesn't change as deal progresses.`],
    ["Old process cohort", `Enrolled ${initiative.oldMotion.dateFrom}–${initiative.oldMotion.dateTo ?? "present"}. ${initiative.oldMotion.description}.`],
    ["New initiative cohort", `Enrolled ${initiative.newMotion.dateFrom !== "TBD" ? initiative.newMotion.dateFrom + "+" : "TBD"}. ${initiative.newMotion.description}.`],
    ["Post-Billing / Closed Won", "Ever entered Recruiting, Resumes Sent, Interview Scheduled, or Agreement Sent."],
    ["No-show proxy", "Missed Zoom Call stage entry. Chili Piper status patchy — not used."],
    ["ROI basis", "Sequence cost only for initiative ROI. Lead acquisition cost ($237) shown as context — already recovered by the ~90% who self-book."],
    ["Timezone", "HubSpot timestamps are SGT (UTC+8). Dashboard convention is GMT+8."],
  ];

  return (
    <div className="card">
      <h3 style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Definitions & Data Notes
      </h3>
      <div>
        {rows.map(([key, val], i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              padding: "7px 0",
              borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : undefined,
              fontSize: 11,
            }}
          >
            <span style={{ minWidth: 190, fontWeight: 500 }}>{key}</span>
            <span style={{ color: "var(--muted)" }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
