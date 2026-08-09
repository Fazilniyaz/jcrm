// Lightweight hand-built SVG charts — no external chart library.
// Marks use the raw Jadvix logo hues: as non-text elements they only need
// the 3:1 contrast threshold, not the 4.5:1 one the UI text shades target.

/* ---------- helpers ---------- */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

/* polar point, degrees measured from 12 o'clock going clockwise */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${x0},${y0} A ${r},${r} 0 ${large} 1 ${x1},${y1}`;
}

/* ---------- Sparkline (mini area, used on the gradient sales cards) ---------- */
export function Sparkline({
  data,
  color = "rgba(255,255,255,0.5)",
  width = 260,
  height = 60,
  id,
}: {
  data: readonly number[];
  color?: string;
  width?: number;
  height?: number;
  id: string;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map(
    (v, i) => [i * step, height - ((v - min) / range) * (height - 12) - 6] as [number, number],
  );
  const line = smoothPath(pts);
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  const gid = `spark-${id}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.6" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Area chart ---------- */
export function AreaChart({
  data,
  labels,
  color = "rgb(var(--brand-blue-rgb))",
  height = 260,
}: {
  data: number[];
  labels: string[];
  color?: string;
  height?: number;
}) {
  const width = 640;
  const padX = 8;
  const padTop = 16;
  const padBottom = 26;
  const max = Math.max(...data) * 1.1;
  const range = max || 1;
  const step = (width - padX * 2) / (data.length - 1);
  const y = (v: number) => padTop + (1 - v / range) * (height - padTop - padBottom);
  const pts = data.map((v, i) => [padX + i * step, y(v)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1][0]},${height - padBottom} L ${pts[0][0]},${height - padBottom} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {grid.map((g, i) => (
        <line
          key={i}
          x1={padX}
          x2={width - padX}
          y1={padTop + g * (height - padTop - padBottom)}
          y2={padTop + g * (height - padTop - padBottom)}
          stroke="var(--default-border)"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
      ))}
      <path d={area} fill="url(#area-fill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {labels.map((l, i) => (
        <text
          key={l}
          x={padX + i * step}
          y={height - 6}
          textAnchor="middle"
          fontSize="11"
          fill="var(--text-muted)"
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

/* ---------- Grouped bar chart (Order status) ---------- */
export function Bars({
  series,
  labels,
  height = 260,
}: {
  series: { name: string; color: string; data: number[] }[];
  labels: string[];
  height?: number;
}) {
  const width = 640;
  const padX = 28;
  const padTop = 12;
  const padBottom = 28;
  const plotH = height - padTop - padBottom;
  const max = Math.max(...series.flatMap((s) => s.data)) * 1.15 || 1;
  const groupW = (width - padX * 2) / labels.length;
  const barW = Math.min(10, (groupW * 0.6) / series.length);
  const gap = 3;
  const clusterW = series.length * barW + (series.length - 1) * gap;
  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {grid.map((g, i) => (
        <line
          key={i}
          x1={padX}
          x2={width - padX}
          y1={padTop + g * plotH}
          y2={padTop + g * plotH}
          stroke="var(--default-border)"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
      ))}
      {labels.map((l, gi) => {
        const gx = padX + gi * groupW + groupW / 2 - clusterW / 2;
        return (
          <g key={l}>
            {series.map((s, si) => {
              const h = (s.data[gi] / max) * plotH;
              const x = gx + si * (barW + gap);
              return (
                <rect
                  key={s.name}
                  x={x}
                  y={padTop + plotH - h}
                  width={barW}
                  height={Math.max(h, 1)}
                  rx={barW / 2}
                  fill={s.color}
                />
              );
            })}
            <text
              x={padX + gi * groupW + groupW / 2}
              y={height - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-muted)"
            >
              {l}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Radial gauge (Valex: startAngle -135, endAngle 135, hollow 60%) ---------- */
export function Gauge({
  percent,
  size = 205,
  from = "#4599d3",
  to = "#1f6ea8",
  children,
}: {
  percent: number;
  size?: number;
  from?: string;
  to?: string;
  children?: React.ReactNode;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const stroke = size * 0.16; // track strokeWidth 80% of the 20% ring band
  const r = (size - stroke) / 2 - 2;
  const START = -135;
  const SWEEP = 270;
  const end = START + (Math.min(Math.max(percent, 0), 100) / 100) * SWEEP;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        {/* dashed track, matching stroke:{dashArray:4} */}
        <path
          d={arcPath(cx, cy, r, START, START + SWEEP)}
          fill="none"
          stroke="var(--custom-bg-color)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray="4 4"
        />
        <path
          d={arcPath(cx, cy, r, START, end)}
          fill="none"
          stroke="url(#gauge-fill)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
