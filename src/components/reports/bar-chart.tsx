"use client";

import { useState } from "react";

export type BarChartDatum = { label: string; value: number; color?: string };

const DEFAULT_COLOR = "#4f46e5";

export function BarChart({
  data,
  height = 160,
  formatValue,
}: {
  data: BarChartDatum[];
  height?: number;
  formatValue?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No data.
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const padding = 24;
  const barGap = 8;
  const innerHeight = height - padding * 2 - 16; // 16 for labels at bottom
  const barWidth = 100 / data.length;

  return (
    <div className="w-full">
      <div className="relative" style={{ height }}>
        <svg width="100%" height={height} preserveAspectRatio="none" viewBox={`0 0 100 ${height}`} className="overflow-visible">
          {data.map((d, i) => {
            const h = (d.value / max) * innerHeight;
            const x = i * barWidth + barGap / 200 * 100;
            const w = barWidth - (barGap / 100) * 50;
            const y = padding + (innerHeight - h);
            const color = d.color ?? DEFAULT_COLOR;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect
                  x={`${x}%`}
                  y={y}
                  width={`${w}%`}
                  height={h}
                  fill={color}
                  rx={2}
                  className="transition-opacity"
                  style={{ opacity: hover === null || hover === i ? 1 : 0.4 }}
                />
                {hover === i && (
                  <text
                    x={`${x + w / 2}%`}
                    y={y - 4}
                    fontSize="9"
                    textAnchor="middle"
                    fill="currentColor"
                    className="fill-foreground"
                  >
                    {formatValue ? formatValue(d.value) : d.value}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-1 grid text-xs text-muted-foreground" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
        {data.map((d, i) => (
          <div key={i} className="truncate px-1 text-center" title={d.label}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}
