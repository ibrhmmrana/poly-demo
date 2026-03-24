"use client";

import { useState } from "react";
import type { MarketRow, BracketJson } from "@/lib/types";

export default function MarketsDetail({ markets }: { markets: MarketRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[var(--dim)] text-xs uppercase border-b-2 border-[var(--border)]">
            <th className="text-left py-2 px-2">City</th>
            <th className="text-left py-2 px-2">Question</th>
            <th className="text-left py-2 px-2">Target Date</th>
            <th className="text-right py-2 px-2">Brackets</th>
            <th className="text-right py-2 px-2">Hours Left</th>
            <th className="text-center py-2 px-2">Active</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => {
            const hoursLeft = Math.max(
              0,
              (new Date(m.end_date).getTime() - Date.now()) / 3600000
            ).toFixed(1);
            const brackets: BracketJson[] =
              typeof m.brackets_json === "string"
                ? JSON.parse(m.brackets_json)
                : m.brackets_json ?? [];
            const isExpanded = expandedId === m.condition_id;

            return (
              <tr key={m.condition_id} className="border-b border-[var(--border)]">
                <td colSpan={6} className="p-0">
                  <div
                    className="flex items-center cursor-pointer hover:bg-[var(--bg3)] py-2 px-2"
                    onClick={() => setExpandedId(isExpanded ? null : m.condition_id)}
                  >
                    <span className="w-16 shrink-0">{m.city_slug.toUpperCase()}</span>
                    <span className="flex-1 truncate text-[var(--dim)]">{m.question}</span>
                    <span className="w-24 text-center">
                      {new Date(m.target_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="w-16 text-right font-mono">{m.num_brackets}</span>
                    <span className="w-20 text-right font-mono">{hoursLeft}h</span>
                    <span className="w-16 text-center">
                      {m.active ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-[var(--green)]" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-[var(--dim)]" />
                      )}
                    </span>
                  </div>

                  {isExpanded && brackets.length > 0 && (
                    <div className="px-6 pb-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[var(--dim)] uppercase">
                            <th className="text-left py-1">Label</th>
                            <th className="text-right py-1">Low</th>
                            <th className="text-right py-1">High</th>
                            <th className="text-right py-1">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {brackets.map((b, i) => (
                            <tr key={i} className="border-t border-[var(--border)]/50">
                              <td className="py-1 font-mono">{b.label}</td>
                              <td className="py-1 text-right font-mono">
                                {b.low !== null ? b.low : "—"}
                              </td>
                              <td className="py-1 text-right font-mono">
                                {b.high !== null ? b.high : "—"}
                              </td>
                              <td className="py-1 text-right font-mono">
                                ${b.market_price?.toFixed(3) ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {markets.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-[var(--dim)]">
                No markets discovered yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
