"use client";
import type { Initiative } from "@/config/initiatives";
import type { MotionMetrics } from "@/lib/hubspot";
import type { CacheData } from "@/lib/cache";
import CohortFunnel from "./CohortFunnel";
import KPICards from "./KPICards";

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyMetrics(maturityDays = 42): MotionMetrics {
  return {
    enrolled: 0, meetings_booked: 0, pipeline_entered: 0, active_client: 0,
    terminated: 0, cl_never_met: 0, cl_booked_no_pipeline: 0, cl_pipeline_no_place: 0,
    still_open: 0, enroll_to_meeting_pct: 0, enroll_to_pipeline_pct: 0,
    enroll_to_active_pct: 0, cl_no_meeting_pct: 0, cohort_age_days: 0,
    is_mature: false, maturity_threshold_days: maturityDays, weekly: [],
  };
}

function pp(nv: number, ov: number): number { return nv - ov; }
function sign(d: number): string { return d > 0 ? "+" : ""; }

// ── Single scorecard ─────────────────────────────────────────────────────────

interface CardProps {
  initiative: Initiative;
  old: MotionMetrics;
  newData: MotionMetrics;
  active: boolean;
  onClick: () => void;
}

function Card({ initiative, old: o, newData: n, active, onClick }: CardProps) {
  const notLaunched = initiative.notYetLaunched;
  const oldR  = o.enroll_to_meeting_pct;
  const newR  = n.enroll_to_meeting_pct;
  const delta = pp(newR, oldR);
  const isMature = n.is_mature;

  return (
    <button className={`scorecard${active ? " active" : ""}`} onClick={onClick} type="button">
      <div className="scorecard-id">Initiative {initiative.id}</div>
      <div className="scorecard-name">{initiative.name}</div>

      {notLaunched ? (
        <div style={{ marginBottom: 6 }}>
          <span className="badge amber">BASELINE</span>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Not yet launched</div>
        </div>
      ) : (
        <>
          <div className="scorecard-metric">
            <span className="scorecard-old">{oldR.toFixed(0)}%</span>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>→</span>
            <span className="scorecard-new">{n.enrolled > 0 ? newR.toFixed(0) + "%" : "—"}</span>
            {n.enrolled > 0 && (
              <span className={delta >= 0 ? "scorecard-delta-up" : "scorecard-delta-down"}>
                {sign(delta)}{delta.toFixed(0)}pp {delta >= 0 ? "▲" : "▼"}
              </span>
            )}
          </div>
          <div className="scorecard-footer">
            {n.enrolled === 0 ? (
              <span style={{ color: "var(--muted)" }}>No data — refresh</span>
            ) : isMature ? (
              <>
                <span style={{ color: "var(--new)" }}>✓</span>
                <span>Mature cohort</span>
              </>
            ) : (
              <>
                <span style={{ color: "var(--warn)" }}>⏱</span>
                <span>Early read · {n.cohort_age_days}d old</span>
              </>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: 8, textAlign: "right" }}>
        <span style={{ fontSize: 10, color: active ? "var(--old)" : "var(--muted)", fontWeight: 600 }}>
          {active ? "▲ collapse" : "▼ expand"}
        </span>
      </div>
    </button>
  );
}

// ── Expanded detail ───────────────────────────────────────────────────────────

interface DetailProps {
  initiative: Initiative;
  old: MotionMetrics;
  newData: MotionMetrics;
  onClose: () => void;
}

function Detail({ initiative, old: o, newData: n, onClose }: DetailProps) {
  const notLaunched = initiative.notYetLaunched;
  const today = new Date();
  const effectiveFrom = initiative.newMotion.dateFrom !== "TBD" ? initiative.newMotion.dateFrom : "";
  const cohortAgeDays = effectiveFrom
    ? Math.max(0, Math.floor((today.getTime() - new Date(effectiveFrom).getTime()) / 86400000))
    : 0;
  const isImmature = cohortAgeDays < (n.maturity_threshold_days ?? 42) && !notLaunched;

  return (
    <div className="ini-detail">
      <div className="ini-detail-header">
        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, marginBottom: 2 }}>
            Initiative {initiative.id}
          </div>
          <h2 style={{ marginBottom: 2 }}>
            {initiative.oldMotion.label} <span style={{ color: "var(--muted)", fontWeight: 400 }}>vs</span>{" "}
            {initiative.newMotion.label}
          </h2>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {initiative.oldMotion.description} vs {initiative.newMotion.description}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", padding: "4px 10px", fontSize: 12, color: "var(--muted)" }}>
          ✕ Close
        </button>
      </div>

      {isImmature && (
        <div className="banner warn" style={{ marginBottom: 14 }}>
          <span className="bicon">⏱</span>
          <div>
            <strong>Early cohort — {cohortAgeDays} days old.</strong> Meeting rate is the only reliable signal now.
            Post-billing and Active Client rates need {n.maturity_threshold_days}+ days.
          </div>
        </div>
      )}

      {notLaunched ? (
        <div className="banner info">
          <span className="bicon">ℹ</span>
          <div><strong>Not yet launched.</strong> Showing baseline metrics only.</div>
        </div>
      ) : (
        <>
          <KPICards old={o} newData={n} />
          <CohortFunnel old={o} newData={n} />
        </>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  initiatives: Initiative[];
  cacheData: CacheData | null;
  expandedId: string | null;
  onToggle: (id: string) => void;
}

export default function InitiativeScorecards({ initiatives, cacheData, expandedId, onToggle }: Props) {
  function getData(id: string): { old: MotionMetrics; new: MotionMetrics } {
    const ini  = initiatives.find((i) => i.id === id)!;
    const raw  = cacheData?.initiatives?.[id];
    return {
      old: raw?.old ?? emptyMetrics(ini.newMotion.maturityDays),
      new: raw?.new ?? emptyMetrics(ini.newMotion.maturityDays),
    };
  }

  const expanded = expandedId ? initiatives.find((i) => i.id === expandedId) : null;
  const expandedData = expanded ? getData(expanded.id) : null;

  return (
    <div>
      <div className="sec-lbl" style={{ marginBottom: 10 }}>Initiative scorecards</div>

      <div className="scorecard-row">
        {initiatives.map((ini) => {
          const { old: o, new: n } = getData(ini.id);
          return (
            <Card
              key={ini.id}
              initiative={ini}
              old={o}
              newData={n}
              active={expandedId === ini.id}
              onClick={() => onToggle(ini.id)}
            />
          );
        })}
      </div>

      {expanded && expandedData && (
        <Detail
          initiative={expanded}
          old={expandedData.old}
          newData={expandedData.new}
          onClose={() => onToggle(expanded.id)}
        />
      )}
    </div>
  );
}
