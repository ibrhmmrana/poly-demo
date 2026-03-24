"use client";

import { useState } from "react";

interface ScanResultRow {
  id: number;
  city: string;
  question?: string | null;
  bracket_label: string;
  side: string;
  market_price: number;
  forecast_prob: number;
  edge_pct: number;
  decision: string;
  skip_reason: string | null;
  trade_size_usd: number | null;
}

interface ScanCycle {
  id: number;
  triggered_at: string;
  duration_ms: number | null;
  markets_found: number;
  edges_found: number;
  trades_placed: number;
  mode: string;
  status: string;
  error_message: string | null;
}

interface Props {
  cycle: ScanCycle;
  results: ScanResultRow[];
}

export default function ScanCard({ cycle, results }: Props) {
  const [open, setOpen] = useState(results.length > 0 && results.length <= 12);

  const ts = new Date(cycle.triggered_at);
  const time = ts.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const duration = cycle.duration_ms
    ? `${(cycle.duration_ms / 1000).toFixed(1)}s`
    : "...";

  const isError = cycle.status === "error";

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[var(--bg3)] transition text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isError
                ? "bg-[var(--red)]"
                : cycle.trades_placed > 0
                  ? "bg-[var(--green)]"
                  : "bg-[var(--dim)]"
            }`}
          />
          <span className="text-sm font-medium text-[var(--text)]">
            Scan #{cycle.id}
          </span>
          <span className="text-xs text-[var(--dim)]">{time}</span>
          <span className="text-xs text-[var(--dim)]">{duration}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isError ? (
            <span className="text-xs text-[var(--red)]">Error</span>
          ) : (
            <>
              <Pill label={`${cycle.markets_found} mkts`} />
              <Pill
                label={`${cycle.edges_found} edges`}
                color={cycle.edges_found > 0 ? "blue" : undefined}
              />
              <Pill
                label={`${cycle.trades_placed} trades`}
                color={cycle.trades_placed > 0 ? "green" : undefined}
              />
            </>
          )}
          <svg
            className={`w-4 h-4 text-[var(--dim)] transition-transform ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-5 py-3">
          {isError && cycle.error_message && (
            <p className="text-sm text-[var(--red)] mb-3">{cycle.error_message}</p>
          )}
          {results.length === 0 ? (
            <p className="text-sm text-[var(--dim)] py-2">
              {isError ? "Scan failed before evaluating edges." : "No edges detected in this scan."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--dim)] text-xs uppercase border-b border-[var(--border)]">
                    <th className="text-left py-2 pr-3">City</th>
                    <th className="text-left py-2 pr-3">Bracket</th>
                    <th className="text-left py-2 pr-3">Side</th>
                    <th className="text-right py-2 pr-3">Forecast</th>
                    <th className="text-right py-2 pr-3">Market</th>
                    <th className="text-right py-2 pr-3">Edge</th>
                    <th className="text-left py-2 pr-3">Decision</th>
                    <th className="text-left py-2">Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-[var(--border)] last:border-b-0 ${
                        r.decision === "TRADED"
                          ? "bg-[var(--green)]/5"
                          : ""
                      }`}
                    >
                      <td className="py-2 pr-3 font-medium">{r.city.toUpperCase()}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.bracket_label}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            r.side === "BUY"
                              ? "bg-[var(--blue)]/15 text-[var(--blue)]"
                              : "bg-[var(--purple)]/15 text-[var(--purple)]"
                          }`}
                        >
                          {r.side}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {(r.forecast_prob * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {(r.market_price * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-[var(--green)]">
                        {r.edge_pct.toFixed(1)}%
                      </td>
                      <td className="py-2 pr-3">
                        {r.decision === "TRADED" ? (
                          <span className="text-xs font-bold text-[var(--green)]">TRADED</span>
                        ) : (
                          <span className="text-xs font-bold text-[var(--yellow)]">SKIP</span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-[var(--dim)] leading-relaxed max-w-[480px]">
                        {buildExplanation(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({ label, color }: { label: string; color?: string }) {
  const c =
    color === "green"
      ? "text-[var(--green)]"
      : color === "blue"
        ? "text-[var(--blue)]"
        : "text-[var(--dim)]";
  return (
    <span className={`text-xs font-medium ${c}`}>{label}</span>
  );
}

function buildExplanation(r: ScanResultRow): string {
  const city = r.city.toUpperCase();
  const forecastPct = (r.forecast_prob * 100).toFixed(1);
  const marketPct = (r.market_price * 100).toFixed(1);
  const edgePct = r.edge_pct.toFixed(1);

  if (r.decision === "TRADED") {
    const sideVerb = r.side === "BUY" ? "buying this bracket" : "selling this bracket";
    const size = r.trade_size_usd?.toFixed(2) ?? "0.00";
    return `Traded because ${sideVerb} had a measurable edge in ${city}: forecast probability (${forecastPct}%) vs market price (${marketPct}%) created a ${edgePct}% edge, and risk checks approved a $${size} position.`;
  }

  const reason = (r.skip_reason ?? "").toLowerCase();
  const reasonText: Record<string, string> = {
    top_n_filter:
      "it ranked below the current top-edge cutoff for this scan, so capital was focused on stronger signals",
    scan_trade_cap:
      "the per-scan trade cap was already reached before this signal was processed",
    city_trade_cap:
      "the per-city trade cap was already reached, preventing over-concentration in one city",
    market_already_traded:
      "another bracket from this same market was already traded in this scan",
    min_size:
      "Kelly sizing produced a position below the configured minimum trade size",
    position_limit:
      "existing exposure on this token was already at the configured position limit",
    daily_limit_hit:
      "the daily loss guardrail was triggered, so new trades were blocked",
    kelly_negative:
      "risk-adjusted expected value was not positive after Kelly sizing",
    execution_failed:
      "execution failed while attempting to place the order",
  };

  const fallback = "it did not pass execution/risk filters for this scan";
  return `Skipped in ${city} even though the raw edge was ${edgePct}% (${forecastPct}% forecast vs ${marketPct}% market) because ${reasonText[reason] ?? fallback}.`;
}
