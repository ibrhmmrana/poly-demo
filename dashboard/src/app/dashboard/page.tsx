import StatCard from "@/components/StatCard";
import PnlChart from "@/components/PnlChart";
import CityBreakdown from "@/components/CityBreakdown";
import DailyPnlChart from "@/components/DailyPnlChart";
import RealtimeRefresher from "@/components/RealtimeRefresher";
import {
  getSummaryStats,
  getCumulativePnl,
  getPnlByCity,
  getDailyHistory,
  getOpenPositions,
} from "@/lib/queries";

export const revalidate = 0;

export default async function OverviewPage() {
  const [stats, pnlData, cityData, dailyData, positions] = await Promise.all([
    getSummaryStats(),
    getCumulativePnl(),
    getPnlByCity(),
    getDailyHistory(),
    getOpenPositions(),
  ]);

  const winRate =
    stats.wins + stats.losses > 0
      ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
      : "0.0";

  return (
    <RealtimeRefresher tables={["trades", "daily_pnl", "bot_settings"]}>
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold">Overview</h2>
        <span
          className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${
            stats.mode === "live"
              ? "bg-[var(--green)] text-black"
              : "bg-[var(--yellow)] text-black"
          }`}
        >
          {stats.mode}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Total P&L"
          value={`$${stats.total_pnl.toFixed(2)}`}
          sub={`avg $${stats.avg_pnl.toFixed(2)} / trade`}
          color={stats.total_pnl >= 0 ? "green" : "red"}
        />
        <StatCard
          label="Today's P&L"
          value={`$${stats.today_pnl.toFixed(2)}`}
          sub={`${stats.today_trades} trades today`}
          color={stats.today_pnl >= 0 ? "green" : "red"}
        />
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          sub={`${stats.wins}W / ${stats.losses}L`}
          color={parseFloat(winRate) >= 50 ? "green" : "red"}
        />
        <StatCard
          label="Total Trades"
          value={String(stats.total_trades)}
          sub={`${stats.pending} open`}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-2">
          <PnlChart data={pnlData} />
        </div>
        <CityBreakdown data={cityData} />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Open Positions */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
          <h3 className="text-sm text-[var(--dim)] mb-3">Open Positions</h3>
          {positions.length === 0 ? (
            <p className="text-[var(--dim)] text-sm text-center py-8">No open positions</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--dim)] text-xs uppercase border-b border-[var(--border)]">
                    <th className="text-left py-2 px-2">City</th>
                    <th className="text-left py-2 px-2">Bracket</th>
                    <th className="text-left py-2 px-2">Side</th>
                    <th className="text-right py-2 px-2">Size</th>
                    <th className="text-right py-2 px-2">Avg Price</th>
                    <th className="text-right py-2 px-2">Edge</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => (
                    <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--bg3)]">
                      <td className="py-2 px-2">{p.city_slug.toUpperCase()}</td>
                      <td className="py-2 px-2 font-mono">{p.bracket_label}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            p.side === "BUY"
                              ? "bg-[var(--blue)]/10 text-[var(--blue)]"
                              : "bg-[var(--purple)]/10 text-[var(--purple)]"
                          }`}
                        >
                          {p.side}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono">${p.total_size.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono">${p.avg_price.toFixed(3)}</td>
                      <td className="py-2 px-2 text-right font-mono">{p.avg_edge.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DailyPnlChart data={dailyData} />
      </div>
    </div>
    </RealtimeRefresher>
  );
}
