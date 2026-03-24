"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

interface CityPnl {
  city_slug: string;
  pnl: number;
  trades: number;
  wins: number;
}

export default function CityBreakdown({ data }: { data: CityPnl[] }) {
  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
      <h3 className="text-sm text-[var(--dim)] mb-3">P&L by City</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis
              type="number"
              tick={{ fill: "#8b949e", fontSize: 11 }}
              tickFormatter={(v: number) => `$${v}`}
            />
            <YAxis
              type="category"
              dataKey="city_slug"
              tick={{ fill: "#8b949e", fontSize: 11 }}
              width={70}
              tickFormatter={(v: string) => v.toUpperCase()}
            />
            <Tooltip
              contentStyle={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 8,
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, "P&L"]}
            />
            <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.pnl >= 0 ? "rgba(63,185,80,0.7)" : "rgba(248,81,73,0.7)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
