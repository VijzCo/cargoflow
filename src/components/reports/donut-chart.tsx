"use client";

export type DonutDatum = { label: string; value: number; color: string };

export function DonutChart({
  data,
  size = 160,
  thickness = 24,
  centerLabel,
}: {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: { value: string; label: string };
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="text-xs text-muted-foreground">No data</div>
      </div>
    );
  }
  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  let offset = 0;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {data.map((d, i) => {
            const fraction = d.value / total;
            const length = fraction * circumference;
            const circle = (
              <circle
                key={i}
                cx={cx} cy={cy} r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += length;
            return circle;
          })}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold">{centerLabel.value}</span>
            <span className="text-xs text-muted-foreground">{centerLabel.label}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 text-sm">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: d.color }} />
            <span className="flex-1 text-muted-foreground">{d.label}</span>
            <span className="font-mono font-medium">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
