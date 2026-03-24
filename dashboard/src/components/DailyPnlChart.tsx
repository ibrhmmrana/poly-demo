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

interface DailyEntry {
  date: string;
  realized: number;
  num_trades: number;
}

export default function DailyPnlChart({ data }: { data: DailyEntry[] }) {
  const last14 = data.slice(-14).map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
      <h3 className="text-sm text-[var(--dim)] mb-3">Daily P&L History</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={last14}>
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
            <Bar dataKey="realized" radius={[4, 4, 0, 0]}>
              {last14.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.realized >= 0 ? "rgba(63,185,80,0.6)" : "rgba(248,81,73,0.6)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
