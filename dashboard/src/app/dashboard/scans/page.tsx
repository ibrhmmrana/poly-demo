import { getScans, getMarkets } from "@/lib/queries";
import MarketsDetail from "@/components/MarketsDetail";
import RealtimeRefresher from "@/components/RealtimeRefresher";

export const revalidate = 0;

export default async function ScansPage() {
  const [scans, markets] = await Promise.all([getScans(50), getMarkets()]);

  return (
    <RealtimeRefresher tables={["scans", "markets"]}><div>
      <h2 className="text-xl font-semibold mb-6">Scans & Markets</h2>

      {/* Scan history */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 mb-5">
        <h3 className="text-sm text-[var(--dim)] mb-3">Scan History</h3>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--bg2)]">
              <tr className="text-[var(--dim)] text-xs uppercase border-b-2 border-[var(--border)]">
                <th className="text-left py-2 px-2">Time</th>
                <th className="text-right py-2 px-2">Markets Found</th>
                <th className="text-right py-2 px-2">New</th>
                <th className="text-right py-2 px-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)] hover:bg-[var(--bg3)]">
                  <td className="py-2 px-2 whitespace-nowrap">
                    {new Date(s.started_at).toLocaleString("en-US", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">{s.markets_found}</td>
                  <td className="py-2 px-2 text-right font-mono">
                    {s.new_markets > 0 ? (
                      <span className="text-[var(--green)]">+{s.new_markets}</span>
                    ) : (
                      s.new_markets
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">{s.duration_ms}ms</td>
                </tr>
              ))}
              {scans.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--dim)]">
                    No scans yet. Start the bot to begin scanning.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Discovered markets */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
        <h3 className="text-sm text-[var(--dim)] mb-3">
          Discovered Markets ({markets.length})
        </h3>
        <MarketsDetail markets={markets} />
      </div>
    </div></RealtimeRefresher>
  );
}
