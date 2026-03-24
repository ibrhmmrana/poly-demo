import { createServerSupabase } from "@/lib/supabase-server";
import ScanCard from "@/components/ScanCard";
import StatusBar from "@/components/StatusBar";
import RealtimeRefresher from "@/components/RealtimeRefresher";

export const revalidate = 0;

export default async function ActivityPage() {
  const sb = createServerSupabase();

  const { data: cycles } = await sb
    .from("scan_cycles")
    .select("*")
    .order("triggered_at", { ascending: false })
    .limit(30);

  const { data: settingsRows } = await sb
    .from("bot_settings")
    .select("key, value");

  const settings: Record<string, string> = {};
  (settingsRows ?? []).forEach((r: { key: string; value: string }) => {
    settings[r.key] = r.value;
  });

  const cycleList = (cycles ?? []) as {
    id: number;
    triggered_at: string;
    duration_ms: number | null;
    markets_found: number;
    edges_found: number;
    trades_placed: number;
    mode: string;
    status: string;
    error_message: string | null;
  }[];

  const cycleIds = cycleList.map((c) => c.id);

  let resultsByScan: Record<number, {
    id: number;
    city: string;
    question?: string | null;
    target_date?: string | null;
    bracket_label: string;
    side: string;
    market_price: number;
    forecast_prob: number;
    edge_pct: number;
    decision: string;
    skip_reason: string | null;
    trade_size_usd: number | null;
  }[]> = {};

  if (cycleIds.length > 0) {
    const { data: results } = await sb
      .from("scan_results")
      .select("*")
      .in("scan_id", cycleIds)
      .order("edge_pct", { ascending: false });

    for (const r of (results ?? []) as {
      id: number;
      scan_id: number;
      city: string;
      question?: string | null;
      target_date?: string | null;
      bracket_label: string;
      side: string;
      market_price: number;
      forecast_prob: number;
      edge_pct: number;
      decision: string;
      skip_reason: string | null;
      trade_size_usd: number | null;
    }[]) {
      if (!resultsByScan[r.scan_id]) resultsByScan[r.scan_id] = [];
      resultsByScan[r.scan_id].push(r);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const scansToday = cycleList.filter(
    (c) => c.triggered_at.slice(0, 10) === today,
  ).length;

  const lastScanAt = cycleList[0]?.triggered_at ?? null;

  return (
    <RealtimeRefresher tables={["scan_cycles", "scan_results"]}>
      <div>
        <h2 className="text-xl font-semibold mb-4">Activity Feed</h2>

        <StatusBar
          mode={settings.mode ?? "paper"}
          lastScanAt={lastScanAt}
          scansToday={scansToday}
          connected={true}
        />

        {cycleList.length === 0 ? (
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
            <p className="text-[var(--dim)] text-sm mb-2">No scans yet.</p>
            <p className="text-[var(--dim)] text-xs">
              Set up n8n to POST to <code className="text-[var(--text)]">/api/bot/run</code> with
              your <code className="text-[var(--text)]">x-api-key</code> header to start scanning.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cycleList.map((c) => (
              <ScanCard
                key={c.id}
                cycle={c}
                results={resultsByScan[c.id] ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </RealtimeRefresher>
  );
}
