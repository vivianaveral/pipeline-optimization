"use client";
import { useState, useEffect, useCallback } from "react";

interface MonthMetrics {
  month: string;
  callsBooked: number;
  noShows: number;
  attended: number;
  billingEntered: number;
  parkingLot: number;
  dropOffs: number;
  dropRate: number;
  closedWon: number;
  activeClient: number;
  closedLost: number;
  recruiting: number;
  resumesSent: number;
  interviewScheduled: number;
  agreementSent: number;
}

interface ApiData {
  lastRefreshed: string;
  dealCount: number;
  defaultPipelineDealCount: number;
  activeClientDealCount: number;
  computed: { byMonth: Record<string, MonthMetrics> };
}

const TARGETS: Record<string, { label: string; target: number }> = {
  callsBooked:   { label: "Calls booked",    target: 1881 },
  noShows:       { label: "No-shows",        target: 722  },
  attended:      { label: "Attended (proxy)", target: 1159 },
  billingEntered:{ label: "Billing entered", target: 766  },
  parkingLot:    { label: "Parking Lot",     target: 266  },
  dropOffs:      { label: "Drop-offs",       target: 127  },
  closedWon:     { label: "Closed Won",      target: 489  },
  activeClient:  { label: "Active Client",   target: 194  },
  closedLost:    { label: "Closed Lost",     target: 2173 },
};

function withinTolerance(actual: number, target: number) {
  return Math.abs(actual - target) / target <= 0.05;
}

export default function ValidationPage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshLog, setRefreshLog] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      if (res.status === 404) { setData(null); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshLog(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setRefreshLog(`Error: ${json.error}`); return; }
      setRefreshLog(`✓ Fetched ${json.dealCount} deals (${json.defaultPipelineDealCount} default + ${json.activeClientDealCount} active client). Refreshed ${json.timestamp}`);
      await loadData();
    } catch (e) {
      setRefreshLog(`Error: ${e}`);
    } finally {
      setRefreshing(false);
    }
  }

  const may = data?.computed.byMonth["2026-05"];
  const months = data ? Object.keys(data.computed.byMonth).sort() : [];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        BruntWork Sales Initiative KPI Tracker — Data Validation
      </h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 13 }}>
        Data layer only. Validate May 2026 numbers before building UI.
      </p>

      {/* Refresh */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ padding: "8px 20px", background: "#185FA5", color: "#fff", border: "none", borderRadius: 4, fontSize: 14, marginRight: 12 }}
        >
          {refreshing ? "Fetching from HubSpot (may take 2–5 min)…" : "Refresh from HubSpot"}
        </button>
        {data && (
          <span style={{ fontSize: 12, color: "#666" }}>
            Last refreshed: {new Date(data.lastRefreshed).toLocaleString()} · {data.dealCount} deals ({data.defaultPipelineDealCount} default pipeline + {data.activeClientDealCount} active client)
          </span>
        )}
        {refreshLog && <p style={{ marginTop: 8, fontSize: 12, color: refreshLog.startsWith("Error") ? "#c00" : "#0a7" }}>{refreshLog}</p>}
      </div>

      {error && <p style={{ color: "#c00", marginBottom: 16 }}>{error}</p>}

      {!data && !error && (
        <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 8, padding: 24, color: "#666" }}>
          No data yet. Click &ldquo;Refresh from HubSpot&rdquo; to load.
        </div>
      )}

      {/* May 2026 Validation */}
      {may && (
        <section style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>May 2026 Validation (±5% tolerance)</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid #e0e0e0" }}>
                <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 12, color: "#666", fontWeight: 500 }}>Metric</th>
                <th style={{ textAlign: "right", padding: "6px 12px", fontSize: 12, color: "#666", fontWeight: 500 }}>Actual</th>
                <th style={{ textAlign: "right", padding: "6px 12px", fontSize: 12, color: "#666", fontWeight: 500 }}>Target</th>
                <th style={{ textAlign: "center", padding: "6px 12px", fontSize: 12, color: "#666", fontWeight: 500 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(TARGETS).map(([key, { label, target }]) => {
                const actual = (may as unknown as Record<string, number>)[key];
                const ok = withinTolerance(actual, target);
                return (
                  <tr key={key} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                    <td style={{ padding: "7px 12px" }}>{label}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {actual?.toLocaleString() ?? "—"}
                    </td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#666", fontVariantNumeric: "tabular-nums" }}>
                      ~{target.toLocaleString()}
                    </td>
                    <td style={{ padding: "7px 12px", textAlign: "center" }}>
                      {ok
                        ? <span style={{ color: "#0a7", fontSize: 13 }}>✓</span>
                        : <span style={{ color: "#c00", fontSize: 13 }}>✗ ({actual > target ? "+" : ""}{actual - target})</span>
                      }
                    </td>
                  </tr>
                );
              })}
              {/* Drop rate separately */}
              <tr style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                <td style={{ padding: "7px 12px" }}>Drop rate</td>
                <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600 }}>{may.dropRate}%</td>
                <td style={{ padding: "7px 12px", textAlign: "right", color: "#666" }}>~11.0%</td>
                <td style={{ padding: "7px 12px", textAlign: "center" }}>
                  {Math.abs(may.dropRate - 11.0) <= 1
                    ? <span style={{ color: "#0a7" }}>✓</span>
                    : <span style={{ color: "#c00" }}>✗</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* All months drop rate table */}
      {data && months.length > 0 && (
        <section style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Post-call drop rate by month</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid #e0e0e0" }}>
                {["Month","Booked","No-shows","Attended","Billing","Parked","Drop-offs","Drop rate"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: h === "Month" ? "left" : "right", fontWeight: 500, color: "#666", fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const row = data.computed.byMonth[m];
                return (
                  <tr key={m} style={{ borderBottom: "0.5px solid #f5f5f5" }}>
                    <td style={{ padding: "6px 10px" }}>{m}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{row.callsBooked.toLocaleString()}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{row.noShows.toLocaleString()}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{row.attended.toLocaleString()}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{row.billingEntered.toLocaleString()}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{row.parkingLot.toLocaleString()}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{row.dropOffs.toLocaleString()}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>{row.dropRate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontSize: 12, color: "#888" }}>
            Targets: Feb 4.4% · Mar 14.7% · Apr 22.8% · May 11.0%
          </div>
        </section>
      )}

      {/* All metrics by month */}
      {data && months.length > 0 && (
        <section style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 8, padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>All months — full metrics</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid #e0e0e0" }}>
                {["Month","Closed Won","Active Client","Closed Lost","Recruiting","Resumes","Interview","Agreement"].map(h => (
                  <th key={h} style={{ padding: "5px 8px", textAlign: h === "Month" ? "left" : "right", fontWeight: 500, color: "#666" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const row = data.computed.byMonth[m];
                return (
                  <tr key={m} style={{ borderBottom: "0.5px solid #f5f5f5" }}>
                    <td style={{ padding: "5px 8px" }}>{m}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{row.closedWon.toLocaleString()}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{row.activeClient.toLocaleString()}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{row.closedLost.toLocaleString()}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{row.recruiting.toLocaleString()}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{row.resumesSent.toLocaleString()}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{row.interviewScheduled.toLocaleString()}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{row.agreementSent.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
