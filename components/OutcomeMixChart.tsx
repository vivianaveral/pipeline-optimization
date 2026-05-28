"use client";
import { useEffect, useRef } from "react";
import type { MotionMetrics } from "@/lib/hubspot";

interface Props {
  old: MotionMetrics;
  newData: MotionMetrics;
}

export default function OutcomeMixChart({ old, newData }: Props) {
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

      chartRef.current = new Chart(canvasRef.current!, {
        type: "doughnut",
        data: {
          labels: ["Active", "Post-Billing open", "CL after pipeline", "CL after meeting", "CL never met", "Open"],
          datasets: [
            {
              label: "Old",
              data: [
                old.active_client,
                old.pipeline_entered - old.active_client,
                old.cl_pipeline_no_place,
                old.cl_booked_no_pipeline,
                old.cl_never_met,
                old.still_open,
              ],
              backgroundColor: ["#2563eb", "#60a5fa", "#fca5a5", "#fdba74", "#dc2626", "#d1d5db"],
              borderWidth: 2,
              borderColor: "#fff",
            },
            {
              label: "New",
              data: [
                newData.active_client,
                newData.pipeline_entered - newData.active_client,
                newData.cl_pipeline_no_place,
                newData.cl_booked_no_pipeline,
                newData.cl_never_met,
                newData.still_open,
              ],
              backgroundColor: ["#059669", "#34d399", "#fca5a5", "#fdba74", "#ef4444", "#d1d5db"],
              borderWidth: 2,
              borderColor: "#fff",
            },
          ],
        },
        options: {
          responsive: true,
          cutout: "30%",
          plugins: {
            legend: { position: "bottom", labels: { font: { size: 10 }, boxWidth: 10, padding: 6 } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const d = ctx.datasetIndex === 0 ? old : newData;
                  const total = d.enrolled || 1;
                  return `${ctx.dataset.label}: ${ctx.raw} (${(((ctx.raw as number) / total) * 100).toFixed(1)}%)`;
                },
              },
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
      <h3>Outcome Mix</h3>
      <canvas ref={canvasRef} style={{ maxHeight: 200 }} />
    </div>
  );
}
