"use client";
import type { HolisticMonthData } from "@/lib/hubspot";

interface Props {
  d: HolisticMonthData;
  validMonths: string[];
  selectedMonth: string;
  onMonthChange: (m: string) => void;
}

function fmtMonth(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-AU", { month: "long", year: "numeric" });
}

interface TileProps {
  label: string;
  value: number;
  sub: string;
  color?: string;
}
function Tile({ label, value, sub, color = "var(--text)" }: TileProps) {
  return (
    <div className="outcome-tile">
      <div className="lbl">{label}</div>
      <div className="outcome-value" style={{ color }}>{value.toLocaleString()}</div>
      <div className="outcome-sub">{sub}</div>
    </div>
  );
}

export default function MonthlyOutcomes({ d, validMonths, selectedMonth, onMonthChange }: Props) {
  const cw  = d.sp_closed_won    ?? 0;
  const ac  = d.sp_active_client ?? 0;
  const cl  = d.sp_closed_lost   ?? 0;

  return (
    <div className="outcomes-wrap">
      <div className="outcomes-header">
        <div>
          <div className="sec-lbl">Monthly outcomes — activity this month</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Deals that moved through each milestone in the selected month
          </div>
        </div>
        {validMonths.length > 1 ? (
          <select value={selectedMonth} onChange={(e) => onMonthChange(e.target.value)}
            style={{ fontSize: 12 }}>
            {validMonths.map((m) => (
              <option key={m} value={m}>{fmtMonth(m)}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
            {selectedMonth ? fmtMonth(selectedMonth) : ""}
          </span>
        )}
      </div>

      <div className="outcomes-grid">
        <Tile
          label="Closed Won"
          value={cw}
          sub="entered pipeline this month"
          color="var(--new)"
        />
        <Tile
          label="Active Client Placed"
          value={ac}
          sub="placed this month · all pipelines"
          color="var(--new)"
        />
        <Tile
          label="Closed Lost"
          value={cl}
          sub="closed lost stage this month"
          color="var(--danger)"
        />
      </div>
    </div>
  );
}
