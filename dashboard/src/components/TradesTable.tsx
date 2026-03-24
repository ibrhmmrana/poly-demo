"use client";

import { useState, useMemo } from "react";
import type { Trade } from "@/lib/types";

type SortKey = "created_at" | "city_slug" | "edge_pct" | "pnl" | "size_usd";

export default function TradesTable({ trades }: { trades: Trade[] }) {
  const [cityFilter, setCityFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const cities = useMemo(
    () => [...new Set(trades.map((t) => t.city_slug))].sort(),
    [trades]
  );

  const filtered = useMemo(() => {
    let list = trades;
    if (cityFilter) list = list.filter((t) => t.city_slug === cityFilter);
    if (outcomeFilter) list = list.filter((t) => t.outcome === outcomeFilter);
    return [...list].sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [trades, cityFilter, outcomeFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  }

  function SortHeader({ label, colKey }: { label: string; colKey: SortKey }) {
    const arrow = sortKey === colKey ? (sortDir === "asc" ? " ▲" : " ▼") : "";
    return (
      <th
        className="text-left py-2 px-2 cursor-pointer hover:text-[var(--text)] select-none"
        onClick={() => toggleSort(colKey)}
      >
        {label}{arrow}
      </th>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-3 mb-4">
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
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] text-sm rounded-lg px-3 py-1.5"
        >
          <option value="">All Outcomes</option>
          <option value="WIN">Wins</option>
          <option value="LOSS">Losses</option>
          <option value="PENDING">Pending</option>
        </select>
        <span className="text-sm text-[var(--dim)] ml-auto self-center">
          {filtered.length} trades
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--bg2)]">
            <tr className="text-[var(--dim)] text-xs uppercase border-b-2 border-[var(--border)]">
              <SortHeader label="Time" colKey="created_at" />
              <SortHeader label="City" colKey="city_slug" />
              <th className="text-left py-2 px-2">Bracket</th>
              <th className="text-left py-2 px-2">Side</th>
              <th className="text-right py-2 px-2">Price</th>
              <SortHeader label="Size" colKey="size_usd" />
              <SortHeader label="Edge" colKey="edge_pct" />
              <th className="text-right py-2 px-2">Forecast</th>
              <SortHeader label="P&L" colKey="pnl" />
              <th className="text-left py-2 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((t) => {
              const dt = new Date(t.created_at);
              const time = dt.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              const sideClass =
                t.side === "BUY"
                  ? "bg-[var(--blue)]/10 text-[var(--blue)]"
                  : "bg-[var(--purple)]/10 text-[var(--purple)]";
              const outcomeClass =
                t.outcome === "WIN"
                  ? "bg-[var(--green)]/15 text-[var(--green)]"
                  : t.outcome === "LOSS"
                    ? "bg-[var(--red)]/15 text-[var(--red)]"
                    : "bg-[var(--yellow)]/15 text-[var(--yellow)]";
              const pnlClass =
                t.pnl > 0 ? "text-[var(--green)]" : t.pnl < 0 ? "text-[var(--red)]" : "";
              const pnlStr = t.outcome === "PENDING" ? "—" : `$${t.pnl.toFixed(2)}`;

              return (
                <tr key={t.id} className="border-b border-[var(--border)] hover:bg-[var(--bg3)]">
                  <td className="py-2 px-2 whitespace-nowrap">{time}</td>
                  <td className="py-2 px-2">{t.city_slug.toUpperCase()}</td>
                  <td className="py-2 px-2 font-mono">{t.bracket_label}</td>
                  <td className="py-2 px-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${sideClass}`}>
                      {t.side}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono">${t.fill_price.toFixed(3)}</td>
                  <td className="py-2 px-2 text-right font-mono">${t.size_usd.toFixed(2)}</td>
                  <td className="py-2 px-2 text-right font-mono">{t.edge_pct.toFixed(1)}%</td>
                  <td className="py-2 px-2 text-right font-mono">
                    {(t.forecast_prob * 100).toFixed(1)}%
                  </td>
                  <td className={`py-2 px-2 text-right font-mono ${pnlClass}`}>{pnlStr}</td>
                  <td className="py-2 px-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${outcomeClass}`}>
                      {t.outcome}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-[var(--dim)] py-12">No trades yet</p>
        )}
      </div>
    </div>
  );
}
