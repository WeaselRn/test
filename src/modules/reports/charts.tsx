/** Chart wrappers with the design-system palette. Owner: Person 3. */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/utils";

const PRIMARY = "#4f46e5";
const ACCENT = "#f2734f";
const GRID = "#ececf4";
const AXIS = { fontSize: 11, fill: "#6f6e82" };

const compact = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `₹${(v / 1e3).toFixed(0)}k` : `₹${v}`);
const monthLabel = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? new Date(`${p}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }) : p);

export function RevenueChart({ data }: { data: { period: string; collected: string; billed: string }[] }) {
  const rows = data.map((d) => ({ period: monthLabel(d.period), Collected: Number(d.collected), Billed: Number(d.billed) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compact} width={56} />
        <Tooltip formatter={(v) => money(Number(v).toFixed(2))} cursor={{ fill: "#f3f3f8" }} contentStyle={{ borderRadius: 8, border: "1px solid #e4e4ec", fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Billed" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="Collected" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MrrChart({ data }: { data: { period: string; mrr: string }[] }) {
  const rows = data.map((d) => ({ period: monthLabel(d.period), MRR: Number(d.mrr) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.22} />
            <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compact} width={56} />
        <Tooltip formatter={(v) => money(Number(v).toFixed(2))} contentStyle={{ borderRadius: 8, border: "1px solid #e4e4ec", fontSize: 12 }} />
        <Area type="monotone" dataKey="MRR" stroke={PRIMARY} strokeWidth={2} fill="url(#mrrFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
