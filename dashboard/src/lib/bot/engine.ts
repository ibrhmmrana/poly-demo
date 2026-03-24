import { createClient } from "@supabase/supabase-js";
import { discoverMarkets } from "./scanner";
import { getForecasts } from "./forecast";
import { findEdges } from "./edge";
import { sizeTrade } from "./risk";
import { executePaper, executeLive } from "./trader";
import type { BotSettings, ScanResult, ScanSummary } from "./types";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key);
}

async function loadSettings(): Promise<BotSettings> {
  const sb = getServiceSupabase();
  const { data } = await sb.from("bot_settings").select("key, value");
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: { key: string; value: string }) => {
    map[r.key] = r.value;
  });
  return {
    mode: (map.mode ?? "paper") as "paper" | "live",
    botPaused: map.bot_paused === "true",
    minEdgePct: parseFloat(map.min_edge_pct ?? "15"),
    maxPositionUsd: parseFloat(map.max_position_usd ?? "10"),
    kellyFraction: parseFloat(map.kelly_fraction ?? "0.25"),
    dailyLossLimitUsd: parseFloat(map.daily_loss_limit_usd ?? "-20"),
  };
}

async function getDailyPnl(): Promise<number> {
  const sb = getServiceSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from("trades")
    .select("pnl")
    .eq("mode", "paper")
    .gte("created_at", `${today}T00:00:00Z`);
  return (data ?? []).reduce(
    (sum: number, r: { pnl: number | null }) => sum + (r.pnl ?? 0),
    0,
  );
}

async function getPositionMap(): Promise<Map<string, number>> {
  const sb = getServiceSupabase();
  const { data } = await sb
    .from("trades")
    .select("token_id, size_usd")
    .eq("outcome", "PENDING");
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const tid = (r as { token_id: string }).token_id;
    const usd = (r as { size_usd: number }).size_usd ?? 0;
    map.set(tid, (map.get(tid) ?? 0) + usd);
  }
  return map;
}

export async function runScanCycle(): Promise<ScanSummary> {
  const start = Date.now();
  const sb = getServiceSupabase();

  // 1. Load settings
  const settings = await loadSettings();

  // Create scan_cycle row
  const { data: cycleRow, error: cycleErr } = await sb
    .from("scan_cycles")
    .insert({
      triggered_at: new Date().toISOString(),
      mode: settings.mode,
      status: "running",
      trigger_source: "api",
    })
    .select("id")
    .single();

  if (cycleErr || !cycleRow) {
    throw new Error(`Failed to create scan cycle: ${cycleErr?.message}`);
  }
  const scanId: number = cycleRow.id;

  try {
    // 2. Check paused
    if (settings.botPaused) {
      await sb
        .from("scan_cycles")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - start,
          error_message: "Bot is paused",
        })
        .eq("id", scanId);

      return {
        scanId,
        duration: Date.now() - start,
        marketsFound: 0,
        edgesFound: 0,
        tradesPlaced: 0,
        mode: settings.mode,
        results: [],
      };
    }

    // 3. Discover markets
    const markets = await discoverMarkets();

    // 4. Fetch forecasts
    const forecasts = await getForecasts(markets);

    // 5. Find edges
    const edges = findEdges(markets, forecasts, settings.minEdgePct);

    // 6. Size & execute each edge
    const dailyPnl = await getDailyPnl();
    const positions = await getPositionMap();
    const results: ScanResult[] = [];
    let tradesPlaced = 0;

    for (const signal of edges) {
      const { sizeUsd, skipReason } = sizeTrade(
        signal,
        settings,
        dailyPnl,
        positions,
      );

      if (sizeUsd <= 0 || skipReason) {
        results.push({
          signal,
          decision: "SKIPPED",
          skipReason: skipReason ?? "edge_below_threshold",
        });
        continue;
      }

      // Execute trade
      const tradeResult =
        settings.mode === "live"
          ? await executeLive(signal, sizeUsd)
          : executePaper(signal, sizeUsd);

      if (tradeResult.status === "REJECTED") {
        results.push({
          signal,
          decision: "SKIPPED",
          skipReason: "execution_failed",
        });
        continue;
      }

      // Insert trade
      const { data: tradeRow } = await sb
        .from("trades")
        .insert({
          id: tradeResult.id,
          scan_id: scanId,
          city: signal.market.citySlug,
          bracket_label: signal.bracket.label,
          target_date: signal.market.targetDate,
          side: signal.side,
          size_usd: sizeUsd,
          size_shares: tradeResult.sizeShares,
          price: signal.marketPrice,
          fill_price: tradeResult.fillPrice,
          edge_pct: signal.edgePct,
          forecast_prob: signal.forecastProb,
          market_prob: signal.marketPrice,
          mode: settings.mode,
          status: tradeResult.status,
          outcome: "PENDING",
          order_id: tradeResult.orderId ?? "",
          condition_id: signal.market.conditionId,
          token_id: signal.bracket.tokenId,
        })
        .select("id")
        .single();

      positions.set(
        signal.bracket.tokenId,
        (positions.get(signal.bracket.tokenId) ?? 0) + sizeUsd,
      );

      results.push({
        signal,
        decision: "TRADED",
        tradeSizeUsd: sizeUsd,
        tradeId: tradeRow?.id ?? tradeResult.id,
      });
      tradesPlaced++;
    }

    // 7. Insert scan_results
    if (results.length > 0) {
      const rows = results.map((r) => ({
        scan_id: scanId,
        city: r.signal.market.citySlug,
        target_date: r.signal.market.targetDate,
        question: r.signal.market.question,
        bracket_label: r.signal.bracket.label,
        side: r.signal.side,
        market_price: r.signal.marketPrice,
        forecast_prob: r.signal.forecastProb,
        edge_pct: r.signal.edgePct,
        decision: r.decision,
        skip_reason: r.skipReason ?? null,
        trade_size_usd: r.tradeSizeUsd ?? null,
        condition_id: r.signal.market.conditionId,
        token_id: r.signal.bracket.tokenId,
      }));
      await sb.from("scan_results").insert(rows);
    }

    // 8. Finalize scan_cycle
    const duration = Date.now() - start;
    await sb
      .from("scan_cycles")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        markets_found: markets.length,
        edges_found: edges.length,
        trades_placed: tradesPlaced,
      })
      .eq("id", scanId);

    return {
      scanId,
      duration,
      marketsFound: markets.length,
      edgesFound: edges.length,
      tradesPlaced,
      mode: settings.mode,
      results,
    };
  } catch (err) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    await sb
      .from("scan_cycles")
      .update({
        status: "error",
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        error_message: message,
      })
      .eq("id", scanId);

    return {
      scanId,
      duration,
      marketsFound: 0,
      edgesFound: 0,
      tradesPlaced: 0,
      mode: settings.mode,
      results: [],
      error: message,
    };
  }
}
