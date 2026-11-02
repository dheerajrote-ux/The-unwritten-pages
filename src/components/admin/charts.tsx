import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/utils";

// Validated with the dataviz palette checker (light surface): both pass
// lightness, chroma, CVD separation and 3:1 contrast.
export const SERIES = { blue: "#3B5EA8", gold: "#B47A2C" };
const AXIS = { fontSize: 11.5, fill: "#6b7686" };
const GRID = "#eef0f3";

const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <p className="mb-1 font-medium text-ink">{label && /^\d{4}-\d{2}-\d{2}$/.test(label) ? new Date(label + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-secondary">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold tabular-nums text-ink">{formatNumber(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Single-series trend over days (area for volume). */
export function TrendChart({ data, dataKey, name, height = 220 }: { data: Record<string, unknown>[]; dataKey: string; name: string; height?: number }) {
  const gid = `g-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.blue} stopOpacity={0.18} />
            <stop offset="100%" stopColor={SERIES.blue} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#c3c8d0", strokeWidth: 1 }} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={SERIES.blue} strokeWidth={2} fill={`url(#${gid})`} activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Two series, same unit (counts) on one axis, with a legend. */
export function DualTrendChart({ data, a, b, height = 260 }: { data: Record<string, unknown>[]; a: { key: string; name: string }; b: { key: string; name: string }; height?: number }) {
  return (
    <div>
      <div className="mb-3 flex gap-5 text-[12.5px] text-secondary" aria-hidden>
        <span className="flex items-center gap-2"><span className="h-0.5 w-4 rounded" style={{ background: SERIES.blue }} />{a.name}</span>
        <span className="flex items-center gap-2"><span className="h-0.5 w-4 rounded border-t-2 border-dashed" style={{ borderColor: SERIES.gold }} />{b.name}</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#c3c8d0", strokeWidth: 1 }} />
          <Line type="monotone" dataKey={a.key} name={a.name} stroke={SERIES.blue} strokeWidth={2} dot={false} activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
          <Line type="monotone" dataKey={b.key} name={b.name} stroke={SERIES.gold} strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranking bars with direct value labels. */
export function RankBars({ rows, valueLabel }: { rows: { label: string; value: number }[]; valueLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3.5" aria-label={valueLabel}>
      {rows.map((r) => (
        <li key={r.label} className="group" title={`${r.label}: ${formatNumber(r.value)} ${valueLabel.toLowerCase()}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-ink">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{formatNumber(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-[#f0f1f4]">
            <div className="h-2 rounded-full transition-[width] duration-500 group-hover:opacity-85" style={{ width: `${(r.value / max) * 100}%`, background: SERIES.blue }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
