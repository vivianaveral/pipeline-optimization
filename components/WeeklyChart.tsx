"use client";
import { useEffect, useRef } from "react";
import type { MotionMetrics } from "@/lib/hubspot";

interface Props {
  old: MotionMetrics;
  newData: MotionMetrics;
}

export default function WeeklyChart({ old, newData }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<unknown>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const loadChart = async () => {
      const { Chart, registerables } = await import("chart.js");
      Chart.register(...registerables);

      if (chartRef.current) {
        (chartRef.current as { destroy: () => void }).destroy();
      }

      const oldWeekly = old.weekly;
      const newWeekly = newData.weekly;
      const oldAvg = old.enroll_to_meeting_pct;
      const newAvg = newData.enroll_to_meeting_pct;

      const allLabels = [...oldWeekly.map((w) => w.week), ...newWeekly.map((w) => w.week)];
      const oldRates = oldWeekly.map((w) => (w.enrolled > 0 ? +(( w.meetings / w.enrolled) * 100).toFixed(1) : 0));
      const newRates = newWeekly.map((w) => (w.enrolled > 0 ? +((w.meetings / w.enrolled) * 100).toFixed(1) : 0));

      chartRef.current = new Chart(canvasRef.current!, {
        type: "bar",
        data: {
          labels: allLabels,
          datasets: [
            {
              label: "Old %",
              data: [...oldRates, ...new Array(newWeekly.length).fill(null)],
              backgroundColor: "#2563eb22",
              borderColor: "#2563eb",
              borderWidth: 1.5,
              borderRadius: 3,
            },
            {
              label: "New %",
              data: [...new Array(oldWeekly.length).fill(null), ...newRates],
              backgroundColor: "#05966922",
              borderColor: "#059669",
              borderWidth: 1.5,
              borderRadius: 3,
            },
            {
              label: `Old avg ${oldAvg.toFixed(1)}%`,
              data: new Array(allLabels.length).fill(oldAvg),
              type: "line" as const,
              borderColor: "#2563eb55",
              borderDash: [4, 3],
              borderWidth: 1,
              pointRadius: 0,
              fill: false,
            } as never,
            {
              label: `New avg ${newAvg.toFixed(1)}%`,
              data: [
                ...new Array(oldWeekly.length).fill(null),
                ...new Array(newWeekly.length).fill(newAvg),
              ],
              type: "line" as const,
              borderColor: "#05966955",
              borderDash: [4, 3],
              borderWidth: 1,
              pointRadius: 0,
              fill: false,
            } as never,
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { font: { size: 10 }, boxWidth: 10 } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const isOld = ctx.datasetIndex === 0;
                  const weeks = isOld ? oldWeekly : newWeekly;
                  const idx = isOld ? ctx.dataIndex : ctx.dataIndex - oldWeekly.length;
                  const w = weeks[idx];
                  if (!w) return `${ctx.dataset.label}: ${ctx.formattedValue}%`;
                  return `${ctx.formattedValue}% (n=${w.enrolled}) · ${w.meetings}/${w.enrolled}`;
                },
              },
            },
          },
          scales: {
            y: {
              max: 70,
              ticks: { callback: (v) => v + "%", font: { size: 10 } },
              grid: { color: "#e2e4ea" },
            },
            x: {
              ticks: { font: { size: 9 }, maxRotation: 45 },
              grid: { display: false },
            },
          },
        },
      });
    };

    loadChart();

    return () => {
      if (chartRef.current) {
        (chartRef.current as { destroy: () => void }).destroy();
      }
    };
  }, [old, newData]);

  return (
    <div className="card">
      <h3>Weekly Meeting Rate</h3>
      <canvas ref={canvasRef} style={{ maxHeight: 200 }} />
    </div>
  );
}
