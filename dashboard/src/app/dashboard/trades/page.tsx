import { createServerSupabase } from "@/lib/supabase-server";
import RealtimeRefresher from "@/components/RealtimeRefresher";
import TradesTable, { type TradeRow } from "@/components/TradesTable";

export const revalidate = 0;

export default async function TradesPage() {
  const sb = createServerSupabase();

  const { data } = await sb
    .from("trades")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  const trades = (data ?? []) as TradeRow[];

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
          <TradesTable trades={trades} />
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

// Outcome badge moved into TradesTable (client component).
