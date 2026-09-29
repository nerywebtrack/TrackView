"use client";

import { useState } from "react";

export type ChartBucket = { key: string; label: string; longLabel: string; value: number };

const WIDTH = 760;
const HEIGHT = 220;
const MARGIN = { top: 16, right: 12, bottom: 28, left: 34 };
const BAR_COLOR = "#6366f1";

export default function CompletionsChart({ buckets, title }: { buckets: ChartBucket[]; title: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, index) => index * step);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const slot = buckets.length ? plotWidth / buckets.length : plotWidth;
  const barWidth = Math.max(2, Math.min(18, slot - 2));
  const y = (value: number) => MARGIN.top + plotHeight - (value / top) * plotHeight;
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 10));
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{total} en el periodo</p>
        </div>
        <button type="button" onClick={() => setAsTable((value) => !value)} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">{asTable ? "Ver gráfica" : "Ver como tabla"}</button>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-2 font-medium">Periodo</th><th className="px-3 py-2 text-right font-medium">Tareas terminadas</th></tr></thead>
            <tbody>{buckets.map((bucket) => <tr key={bucket.key} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-700">{bucket.longLabel}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{bucket.value}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={`${title}: ${total} en el periodo`} onMouseLeave={() => setHovered(null)}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke="#eef0f4" strokeWidth={1} />
                <text x={MARGIN.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#94a3b8">{tick}</text>
              </g>
            ))}
            {buckets.map((bucket, index) => {
              const cx = MARGIN.left + slot * index + slot / 2;
              const barTop = y(bucket.value);
              const height = MARGIN.top + plotHeight - barTop;
              return (
                <g key={bucket.key}>
                  {bucket.value > 0 && <path d={roundedTop(cx - barWidth / 2, barTop, barWidth, height, Math.min(4, barWidth / 2, height))} fill={BAR_COLOR} opacity={hovered === null || hovered === index ? 1 : 0.45} />}
                  {index % labelEvery === 0 && <text x={cx} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="#94a3b8">{bucket.label}</text>}
                  <rect x={MARGIN.left + slot * index} y={MARGIN.top} width={slot} height={plotHeight} fill="transparent" onMouseEnter={() => setHovered(index)} />
                </g>
              );
            })}
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={MARGIN.top + plotHeight} y2={MARGIN.top + plotHeight} stroke="#e2e8f0" strokeWidth={1} />
          </svg>
          {hovered !== null && buckets[hovered] && (
            <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg" style={{ left: `${((MARGIN.left + slot * hovered + slot / 2) / WIDTH) * 100}%` }}>
              <p className="font-semibold">{buckets[hovered].longLabel}</p>
              <p className="text-slate-300">{buckets[hovered].value} {buckets[hovered].value === 1 ? "tarea terminada" : "tareas terminadas"}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, width: number, height: number, radius: number) {
  const bottom = y + height;
  return `M${x},${bottom} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + width - radius} Q${x + width},${y} ${x + width},${y + radius} V${bottom} Z`;
}

function niceStep(max: number) {
  if (max <= 5) return 1;
  const raw = max / 5;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}
