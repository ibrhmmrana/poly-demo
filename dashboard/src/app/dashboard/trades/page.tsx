import TradesTable from "@/components/TradesTable";
import RealtimeRefresher from "@/components/RealtimeRefresher";
import { getTrades } from "@/lib/queries";

export const revalidate = 0;

export default async function TradesPage() {
  const trades = await getTrades(500);

  return (
    <RealtimeRefresher tables={["trades"]}>
    <div>
      <h2 className="text-xl font-semibold mb-6">Trade History</h2>
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
        <TradesTable trades={trades} />
      </div>
    </div>
    </RealtimeRefresher>
  );
}
