"use client";
import { useState, useEffect } from "react";
import type { MotionMetrics } from "@/lib/hubspot";

interface Props {
  old: MotionMetrics;
  newData: MotionMetrics;
  defaultCostOld?: number;
  defaultCostNew?: number;
}

function $f(n: number) {
  const abs = "$" + Math.abs(Math.round(n)).toLocaleString();
  return n < 0 ? "-" + abs : abs;
}

function pct(v: number) {
  return v.toFixed(1) + "%";
}

function ROICard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: string;
}) {
  const valClass = highlight?.includes("oldl")
    ? "blue"
    : highlight?.includes("newl")
    ? "green"
    : highlight?.includes("fefce8") || highlight?.includes("fffbeb")
    ? "amber"
    : "";

  return (
    <div className="card" style={{ margin: 0, ...(highlight ? { background: highlight } : {}) }}>
      <div className="lbl">{label}</div>
      <div className={`big ${valClass}`}>{value}</div>
      <div className="sub" dangerouslySetInnerHTML={{ __html: sub }} />
    </div>
  );
}

export default function ROIModule({ old, newData, defaultCostOld = 0, defaultCostNew = 60 }: Props) {
  const [cOld, setCOld] = useState(defaultCostOld);
  const [cNew, setCNew] = useState(defaultCostNew);
  const [cLead, setCLead] = useState(237);
  const [mrr, setMrr] = useState(1500);
  const [margin, setMargin] = useState(25);
  const [tenure, setTenure] = useState(8);
  const [activeTab, setActiveTab] = useState<"i" | "r" | "s">("i");

  const ltv = mrr * (margin / 100) * tenure;

  const ENROLL = 196;
  const ATTEND = 0.556;
  const MTG_PB = old.pipeline_entered / Math.max(old.meetings_booked, 1);
  const PB_ACT = old.active_client / Math.max(old.pipeline_entered, 1);

  const oR = old.enroll_to_meeting_pct / 100;
  const nR = newData.enroll_to_meeting_pct / 100;

  const oMtgMo = Math.round(ENROLL * oR);
  const nMtgMo = Math.round(ENROLL * nR);
  const oActMo = ENROLL * oR * ATTEND * MTG_PB * PB_ACT;
  const nActMo = ENROLL * nR * ATTEND * MTG_PB * PB_ACT;
  const oSeqMo = oMtgMo * cOld;
  const nSeqMo = nMtgMo * cNew;
  const oRevMo = oActMo * ltv;
  const nRevMo = nActMo * ltv;
  const oNetMo = oRevMo - oSeqMo;
  const nNetMo = nRevMo - nSeqMo;
  const seqDelta = nSeqMo - oSeqMo;
  const revDelta = nRevMo - oRevMo;
  const netGain = revDelta - seqDelta;
  const incrROI = seqDelta > 0 ? (netGain / seqDelta) * 100 : 0;
  const extraClients = nActMo - oActMo;
  const cPerExtra = extraClients > 0 ? seqDelta / extraClients : 0;

  const leadPool = ENROLL * cLead;
  const oRecRate = leadPool > 0 ? (oRevMo / leadPool) * 100 : 0;
  const nRecRate = leadPool > 0 ? (nRevMo / leadPool) * 100 : 0;

  const tabs = [
    { id: "i" as const, label: "Initiative ROI" },
    { id: "r" as const, label: "Recovery value" },
    { id: "s" as const, label: "Scale projection" },
  ];

  return (
    <div className="card">
      <h3>ROI & Cost Efficiency</h3>

      {/* Assumptions */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          padding: "10px 12px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 7,
          marginBottom: 14,
        }}
      >
        <div className="assumption">
          <label>Old process $/meeting</label>
          <input type="number" value={cOld} min={0} step={5} onChange={(e) => setCOld(+e.target.value)} />
        </div>
        <div className="assumption">
          <label>New initiative $/meeting</label>
          <input type="number" value={cNew} min={0} step={5} onChange={(e) => setCNew(+e.target.value)} />
        </div>
        <div className="assumption">
          <label>Lead acq. cost</label>
          <input type="number" value={cLead} min={0} step={1} onChange={(e) => setCLead(+e.target.value)} />
        </div>
        <div className="assumption">
          <label>Monthly MRR</label>
          <input type="number" value={mrr} min={0} step={100} onChange={(e) => setMrr(+e.target.value)} />
        </div>
        <div className="assumption">
          <label>Margin %</label>
          <input type="number" value={margin} min={1} max={100} step={1} onChange={(e) => setMargin(+e.target.value)} />
        </div>
        <div className="assumption">
          <label>Tenure (mo)</label>
          <input type="number" value={tenure} min={1} step={1} onChange={(e) => setTenure(+e.target.value)} />
        </div>
        <div className="derived">
          Margin LTV: <strong>{$f(ltv)}</strong>
        </div>
      </div>

      {/* Tabs */}
      <div className="fl" style={{ marginBottom: 14 }}>
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "i" && (
        <div className="row3">
          <ROICard
            label="Net gain — new vs old / month"
            value={`+${$f(netGain)}`}
            sub={`+${$f(revDelta)} margin − ${$f(seqDelta)} extra seq. cost<br/>on ~${ENROLL} enrolled leads/month`}
            highlight="var(--newl)"
          />
          <ROICard
            label="ROI on incremental sequence spend"
            value={`${Math.round(incrROI)}%`}
            sub={`${$f(netGain)} net on ${$f(seqDelta)} extra cost<br/>New initiative $${cNew - cOld} more per meeting`}
            highlight="var(--oldl)"
          />
          <ROICard
            label="Break-even"
            value={revDelta > seqDelta ? "✓ Positive" : "✗ Not yet"}
            sub={`Needs >${$f(seqDelta)} extra margin/mo<br/>Generates ${$f(revDelta)} — ${revDelta > seqDelta ? "passes" : "fails"}`}
          />
          <ROICard
            label="Old process — seq. ROI/mo"
            value={oSeqMo > 0 ? `${Math.round((oNetMo / oSeqMo) * 100)}%` : "—"}
            sub={`${$f(oNetMo)} net · ${$f(oRevMo)} rev − ${$f(oSeqMo)} cost<br/>${oMtgMo} meetings × $${cOld} · ${oActMo.toFixed(1)} clients`}
          />
          <ROICard
            label="New initiative — seq. ROI/mo ⏱"
            value={nSeqMo > 0 ? `${Math.round((nNetMo / nSeqMo) * 100)}%` : "—"}
            sub={`${$f(nNetMo)} net · ${$f(nRevMo)} rev − ${$f(nSeqMo)} cost<br/>${nMtgMo} meetings × $${cNew} · ${nActMo.toFixed(1)} proj. clients`}
            highlight="var(--newl)"
          />
          <ROICard
            label="Cost / incremental active client"
            value={$f(cPerExtra)}
            sub={`vs ${$f(ltv)} LTV · ${ltv > 0 && cPerExtra > 0 ? (ltv / cPerExtra).toFixed(1) : "—"}x return<br/>+${extraClients.toFixed(1)} extra clients/mo from new initiative`}
          />
        </div>
      )}

      {activeTab === "r" && (
        <div className="row3">
          <ROICard
            label="Already-invested lead cost / mo"
            value={$f(leadPool)}
            sub={`${ENROLL} leads × ${$f(cLead)}<br/>Paid via ad spend before any sequence ran`}
            highlight="#fffbeb"
          />
          <ROICard
            label="Old process recovery rate"
            value={pct(oRecRate)}
            sub={`${$f(oRevMo)} margin recovered<br/>from ${$f(leadPool)} of leads that didn't self-book`}
          />
          <ROICard
            label="New initiative recovery rate ⏱"
            value={pct(nRecRate)}
            sub={`${$f(nRevMo)} projected margin<br/>+${pct(nRecRate - oRecRate)} more of invested lead cost recovered`}
            highlight="var(--newl)"
          />
          <ROICard
            label="Old process — net recovery"
            value={$f(oNetMo)}
            sub={`After ${$f(oSeqMo)} sequence cost<br/>${oMtgMo} meetings booked · ${oActMo.toFixed(1)} clients`}
          />
          <ROICard
            label="New initiative — net recovery ⏱"
            value={$f(nNetMo)}
            sub={`After ${$f(nSeqMo)} sequence cost<br/>${nMtgMo} meetings booked · ${nActMo.toFixed(1)} proj. clients`}
            highlight="var(--newl)"
          />
          <ROICard
            label="Additional value recovered"
            value={`+${$f(netGain)}/mo`}
            sub={`New initiative recovers ${$f(netGain)} more per month<br/>${$f(netGain * 12)} additional per year`}
          />
        </div>
      )}

      {activeTab === "s" && (
        <div className="row3">
          <ROICard
            label="Annual net gain — new vs old"
            value={`+${$f(netGain * 12)}`}
            sub={`+${$f(netGain)}/mo × 12<br/>On ~${ENROLL} enrolled leads/month`}
            highlight="var(--newl)"
          />
          <ROICard
            label="Annual incremental seq. cost"
            value={$f(seqDelta * 12)}
            sub={`${$f(seqDelta)}/mo × 12<br/>Premium for SDR calls over email only`}
          />
          <ROICard
            label="Annual incremental margin"
            value={`+${$f(revDelta * 12)}`}
            sub={`${$f(revDelta)}/mo × 12<br/>From +${extraClients.toFixed(1)} extra clients/month`}
          />
          <ROICard
            label="Additional active clients / yr"
            value={`+${(extraClients * 12).toFixed(1)}`}
            sub={`+${extraClients.toFixed(1)}/mo if conversion holds<br/>⏱ Confirm after ${newData.maturity_threshold_days} days`}
            highlight="#fffbeb"
          />
          <ROICard
            label="ROI on incremental spend"
            value={`${Math.round(incrROI)}%`}
            sub={`${$f(netGain * 12)} net on ${$f(seqDelta * 12)} spend<br/>Consistent monthly rate applied`}
          />
          <ROICard
            label="⏱ Projection confidence"
            value="Medium"
            sub={`Meeting rate confirmed early signal<br/>Active conversion unconfirmed until cohort matures`}
          />
        </div>
      )}
    </div>
  );
}
