import { createServerSupabase } from "@/lib/supabase-server";
import RealtimeRefresher from "@/components/RealtimeRefresher";

export const revalidate = 0;

interface Trade {
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
}

export default async function TradesPage() {
  const sb = createServerSupabase();

  const { data } = await sb
    .from("trades")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  const trades = (data ?? []) as Trade[];

  const totalPnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const resolved = trades.filter((t) => t.outcome !== "PENDING");
  const wins = resolved.filter((t) => t.outcome === "WIN").length;
  const losses = resolved.filter((t) => t.outcome === "LOSS").length;
  const winRate = resolved.length > 0 ? ((wins / resolved.length) * 100).toFixed(1) : "—";
  const pending = trades.filter((t) => t.outcome === "PENDING").length;

  return (
    <RealtimeRefresher tables={["trades"]}>
      <div>
        <h2 className="text-xl font-semibold mb-4">Trades</h2>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <StatBox label="Total P&L" value={`$${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? "green" : "red"} />
          <StatBox label="Win Rate" value={`${winRate}%`} />
          <StatBox label="Wins" value={String(wins)} color="green" />
          <StatBox label="Losses" value={String(losses)} color="red" />
          <StatBox label="Pending" value={String(pending)} />
        </div>

        {trades.length === 0 ? (
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
            <p className="text-[var(--dim)] text-sm">No trades yet.</p>
          </div>
        ) : (
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
                  {trades.map((t) => (
                    <tr key={t.id} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg3)]">
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </RealtimeRefresher>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "green" | "red";
}) {
  const c =
    color === "green"
      ? "text-[var(--green)]"
      : color === "red"
        ? "text-[var(--red)]"
        : "text-[var(--text)]";
  return (
    <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
      <p className="text-xs text-[var(--dim)] uppercase mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${c}`}>{value}</p>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "WIN")
    return <span className="text-xs font-bold text-[var(--green)] bg-[var(--green)]/10 px-2 py-0.5 rounded">WIN</span>;
  if (outcome === "LOSS")
    return <span className="text-xs font-bold text-[var(--red)] bg-[var(--red)]/10 px-2 py-0.5 rounded">LOSS</span>;
  return <span className="text-xs font-bold text-[var(--yellow)] bg-[var(--yellow)]/10 px-2 py-0.5 rounded">PENDING</span>;
}
