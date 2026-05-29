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

      // Fade bars where n<20 (low sample size)
      const LOW_N = 20;
      const oldBgs = oldWeekly.map((w) => w.enrolled < LOW_N ? "#2563eb0d" : "#2563eb22");
      const newBgs = newWeekly.map((w) => w.enrolled < LOW_N ? "#0596690d" : "#05966922");
      const oldBorders = oldWeekly.map((w) => w.enrolled < LOW_N ? "#2563eb66" : "#2563eb");
      const newBorders = newWeekly.map((w) => w.enrolled < LOW_N ? "#05966966" : "#059669");

      // Inline plugin: draw n= label above each bar, red warning for n<20
      const nLabelPlugin = {
        id: "nLabels",
        afterDatasetsDraw(chart: InstanceType<typeof Chart>) {
          const ctx2 = chart.ctx;
          [0, 1].forEach((dsIdx) => {
            const meta = chart.getDatasetMeta(dsIdx);
            const weeks = dsIdx === 0 ? oldWeekly : newWeekly;
            meta.data.forEach((bar, barIdx) => {
              const wIdx = dsIdx === 0 ? barIdx : barIdx - oldWeekly.length;
              const w = weeks[wIdx];
              if (!w || w.enrolled === 0) return;
              const lowN = w.enrolled < LOW_N;
              const txt = lowN ? `n=${w.enrolled} ⚠` : `n=${w.enrolled}`;
              ctx2.save();
              ctx2.font = "bold 8px sans-serif";
              ctx2.fillStyle = lowN ? "#dc2626" : "#6b7280";
              ctx2.textAlign = "center";
              ctx2.fillText(txt, bar.x, bar.y - 3);
              ctx2.restore();
            });
          });
        },
      };

      chartRef.current = new Chart(canvasRef.current!, {
        type: "bar",
        plugins: [nLabelPlugin],
        data: {
          labels: allLabels,
          datasets: [
            {
              label: "Old %",
              data: [...oldRates, ...new Array(newWeekly.length).fill(null)],
              backgroundColor: [...oldBgs, ...new Array(newWeekly.length).fill(null)] as string[],
              borderColor: [...oldBorders, ...new Array(newWeekly.length).fill(null)] as string[],
              borderWidth: 1.5,
              borderRadius: 3,
            },
            {
              label: "New %",
              data: [...new Array(oldWeekly.length).fill(null), ...newRates],
              backgroundColor: [...new Array(oldWeekly.length).fill(null), ...newBgs] as string[],
              borderColor: [...new Array(oldWeekly.length).fill(null), ...newBorders] as string[],
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
                  const flag = w.enrolled < LOW_N ? " ⚠ low sample" : "";
                  return `${ctx.formattedValue}% (n=${w.enrolled}) · ${w.meetings}/${w.enrolled}${flag}`;
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
