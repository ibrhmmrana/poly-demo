"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface PnlPoint {
  time: string;
  pnl: number;
}

export default function PnlChart({ data }: { data: PnlPoint[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.time).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
      <h3 className="text-sm text-[var(--dim)] mb-3">Cumulative P&L</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formatted}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis dataKey="label" tick={{ fill: "#8b949e", fontSize: 11 }} />
            <YAxis
              tick={{ fill: "#8b949e", fontSize: 11 }}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 8,
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, "P&L"]}
            />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="#58a6ff"
              fill="rgba(88,166,255,0.08)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
