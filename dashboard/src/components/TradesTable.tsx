"use client";

import { Fragment, useState } from "react";

export interface TradeRow {
  id: string;
  city: string;
  bracket_label: string;
  target_date: string | null;
  side: string;
  size_usd: number;
  fill_price: number | null;
  edge_pct: number | null;
  forecast_prob: number | null;
  market_prob: number | null;
  mode: string;
  outcome: string;
  pnl: number;
  created_at: string;
  token_id?: string | null;
  condition_id?: string | null;
  order_id?: string | null;
}

type TradeDetails =
  | {
      ok: true;
      market: {
        question: string | null;
        slug: string | null;
        conditionId: string | null;
        endDate: string | null;
        closed: boolean | null;
        active: boolean | null;
        umaResolutionStatus: string | null;
        resolutionSource: string | null;
        outcomes: string[] | null;
        outcomePrices: string | null;
      };
    }
  | { error: string };

export default function TradesTable({ trades }: { trades: TradeRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, TradeDetails>>(
    {},
  );

  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--dim)] text-xs uppercase border-b border-[var(--border)] bg-[var(--bg3)]">
              <th className="text-left py-2.5 px-3">Time</th>
              <th className="text-left py-2.5 px-3">City</th>
              <th className="text-left py-2.5 px-3">Bracket</th>
              <th className="text-left py-2.5 px-3">Side</th>
              <th className="text-right py-2.5 px-3">Size</th>
              <th className="text-right py-2.5 px-3">Price</th>
              <th className="text-right py-2.5 px-3">Edge</th>
              <th className="text-center py-2.5 px-3">Outcome</th>
              <th className="text-right py-2.5 px-3">P&L</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const isOpen = openId === t.id;
              const details = detailsById[t.id];
              const isLoading = loadingId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr
                    className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg3)] cursor-pointer"
                    onClick={() => void toggle(t)}
                    title="Click for trade details"
                  >
                    <td className="py-2 px-3 text-xs text-[var(--dim)]">
                      {new Date(t.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2 px-3 font-medium">{t.city.toUpperCase()}</td>
                    <td className="py-2 px-3 font-mono text-xs">{t.bracket_label}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          t.side === "BUY"
                            ? "bg-[var(--blue)]/15 text-[var(--blue)]"
                            : "bg-[var(--purple)]/15 text-[var(--purple)]"
                        }`}
                      >
                        {t.side}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">${t.size_usd.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      ${(t.fill_price ?? 0).toFixed(3)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--green)]">
                      {(t.edge_pct ?? 0).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-center">
                      <OutcomeBadge outcome={t.outcome} />
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono ${
                        t.pnl > 0
                          ? "text-[var(--green)]"
                          : t.pnl < 0
                            ? "text-[var(--red)]"
                            : "text-[var(--dim)]"
                      }`}
                    >
                      {t.outcome === "PENDING" ? "—" : `$${t.pnl.toFixed(2)}`}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="border-b border-[var(--border)] last:border-b-0">
                      <td colSpan={9} className="py-3 px-3 bg-[var(--bg3)]/40">
                        {isLoading && (
                          <p className="text-xs text-[var(--dim)]">Loading trade details…</p>
                        )}

                        {!isLoading && details && "error" in details && (
                          <p className="text-xs text-[var(--red)]">{details.error}</p>
                        )}

                        {!isLoading && details && "ok" in details && details.ok && (
                          <div className="space-y-1 text-xs text-[var(--dim)]">
                            <p>
                              Question:{" "}
                              <span className="text-[var(--text)]">
                                {details.market.question ?? "—"}
                              </span>
                            </p>
                            <p>
                              Target date:{" "}
                              <span className="text-[var(--text)]">
                                {t.target_date ?? "—"}
                              </span>{" "}
                              | Mode:{" "}
                              <span className="text-[var(--text)]">{t.mode}</span>
                            </p>
                            <p>
                              Condition:{" "}
                              <span className="text-[var(--text)]">
                                {t.condition_id ?? details.market.conditionId ?? "—"}
                              </span>
                              {details.market.umaResolutionStatus ? (
                                <>
                                  {" "}
                                  | UMA:{" "}
                                  <span className="text-[var(--text)]">
                                    {details.market.umaResolutionStatus}
                                  </span>
                                </>
                              ) : null}
                            </p>
                            {t.order_id ? (
                              <p>
                                Order ID:{" "}
                                <span className="text-[var(--text)]">{t.order_id}</span>
                              </p>
                            ) : null}
                            {details.market.resolutionSource ? (
                              <p>
                                Resolution source:{" "}
                                <span className="text-[var(--text)] break-all">
                                  {details.market.resolutionSource}
                                </span>
                              </p>
                            ) : null}
                          </div>
                        )}

                        {!isLoading && !details && (
                          <p className="text-xs text-[var(--dim)]">
                            No details loaded.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  async function toggle(t: TradeRow) {
    const next = openId === t.id ? null : t.id;
    setOpenId(next);
    if (next === null) return;

    if (detailsById[t.id]) return;

    try {
      setLoadingId(t.id);
      const qs =
        t.token_id
          ? `token_id=${encodeURIComponent(t.token_id)}`
          : t.condition_id
            ? `condition_id=${encodeURIComponent(t.condition_id)}`
            : "";
      if (!qs) {
        setDetailsById((prev) => ({
          ...prev,
          [t.id]: { error: "No token_id/condition_id on this trade row." },
        }));
        return;
      }

      const res = await fetch(`/api/trades/details?${qs}`, { cache: "no-store" });
      const payload = (await res.json()) as TradeDetails;
      if (!res.ok || ("error" in payload && payload.error)) {
        throw new Error("error" in payload ? payload.error : "Failed to load details");
      }
      setDetailsById((prev) => ({ ...prev, [t.id]: payload }));
    } catch (err) {
      setDetailsById((prev) => ({
        ...prev,
        [t.id]: { error: err instanceof Error ? err.message : "Failed to load details" },
      }));
    } finally {
      setLoadingId(null);
    }
  }
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "WIN")
    return (
      <span className="text-xs font-bold text-[var(--green)] bg-[var(--green)]/10 px-2 py-0.5 rounded">
        WIN
      </span>
    );
  if (outcome === "LOSS")
    return (
      <span className="text-xs font-bold text-[var(--red)] bg-[var(--red)]/10 px-2 py-0.5 rounded">
        LOSS
      </span>
    );
  return (
    <span className="text-xs font-bold text-[var(--yellow)] bg-[var(--yellow)]/10 px-2 py-0.5 rounded">
      PENDING
    </span>
  );
}

