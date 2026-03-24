import SignalsTable from "@/components/SignalsTable";
import RealtimeRefresher from "@/components/RealtimeRefresher";
import { getSignals } from "@/lib/queries";

export const revalidate = 0;

export default async function SignalsPage() {
  const signals = await getSignals(500);

  return (
    <RealtimeRefresher tables={["signals"]}>
    <div>
      <h2 className="text-xl font-semibold mb-6">Edge Signals</h2>
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
        <SignalsTable signals={signals} />
      </div>
    </div>
    </RealtimeRefresher>
  );
}
