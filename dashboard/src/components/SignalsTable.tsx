"use client";

import { useState, useMemo } from "react";
import type { SignalRow } from "@/lib/types";

export default function SignalsTable({ signals }: { signals: SignalRow[] }) {
  const [cityFilter, setCityFilter] = useState("");
  const [sideFilter, setSideFilter] = useState("");
  const [actedFilter, setActedFilter] = useState("");

  const cities = useMemo(
    () => [...new Set(signals.map((s) => s.city_slug))].sort(),
    [signals]
  );

  const filtered = useMemo(() => {
    let list = signals;
    if (cityFilter) list = list.filter((s) => s.city_slug === cityFilter);
    if (sideFilter) list = list.filter((s) => s.side === sideFilter);
    if (actedFilter === "yes") list = list.filter((s) => s.acted_on);
    if (actedFilter === "no") list = list.filter((s) => !s.acted_on);
    return list;
  }, [signals, cityFilter, sideFilter, actedFilter]);

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] text-sm rounded-lg px-3 py-1.5"
        >
          <option value="">All Cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>
        <select
          value={sideFilter}
          onChange={(e) => setSideFilter(e.target.value)}
          className="bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] text-sm rounded-lg px-3 py-1.5"
        >
          <option value="">All Sides</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <select
          value={actedFilter}
          onChange={(e) => setActedFilter(e.target.value)}
          className="bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] text-sm rounded-lg px-3 py-1.5"
        >
          <option value="">All Signals</option>
          <option value="yes">Acted On</option>
          <option value="no">Skipped</option>
        </select>
        <span className="text-sm text-[var(--dim)] ml-auto self-center">
          {filtered.length} signals
        </span>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--bg2)]">
            <tr className="text-[var(--dim)] text-xs uppercase border-b-2 border-[var(--border)]">
              <th className="text-left py-2 px-2">Time</th>
              <th className="text-left py-2 px-2">City</th>
              <th className="text-left py-2 px-2">Bracket</th>
              <th className="text-left py-2 px-2">Side</th>
              <th className="text-right py-2 px-2">Forecast</th>
              <th className="text-right py-2 px-2">Market</th>
              <th className="text-right py-2 px-2">Edge</th>
              <th className="text-right py-2 px-2">Size</th>
              <th className="text-center py-2 px-2">Acted</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((s) => {
              const dt = new Date(s.created_at);
              const time = dt.toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              });
              const sideClass =
                s.side === "BUY"
                  ? "bg-[var(--blue)]/10 text-[var(--blue)]"
                  : "bg-[var(--purple)]/10 text-[var(--purple)]";

              return (
                <tr key={s.id} className={`border-b border-[var(--border)] hover:bg-[var(--bg3)] ${!s.acted_on ? "opacity-50" : ""}`}>
                  <td className="py-2 px-2 whitespace-nowrap">{time}</td>
                  <td className="py-2 px-2">{s.city_slug.toUpperCase()}</td>
                  <td className="py-2 px-2 font-mono">{s.bracket_label}</td>
                  <td className="py-2 px-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${sideClass}`}>
                      {s.side}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {(s.forecast_prob * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {(s.market_prob * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-[var(--green)]">
                    {s.edge_pct.toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    ${s.suggested_size.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {s.acted_on ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--green)]/15 text-[var(--green)]">
                        TRADED
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--dim)]/15 text-[var(--dim)]">
                        SKIP
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-[var(--dim)] py-12">No signals yet</p>
        )}
      </div>
    </div>
  );
}
