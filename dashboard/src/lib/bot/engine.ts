import { createClient } from "@supabase/supabase-js";
import { discoverMarkets } from "./scanner";
import { getForecasts } from "./forecast";
import { findEdges } from "./edge";
import { sizeTrade } from "./risk";
import { executePaper, executeLive } from "./trader";
import type {
  BotSettings,
  ResolveSummary,
  ScanResult,
  ScanSummary,
} from "./types";

function toNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key);
}

type BookTop = {
  bid: number | null;
  ask: number | null;
  spread: number | null;
};

async function fetchBookTop(tokenId: string): Promise<BookTop> {
  try {
    const res = await fetch(
      `https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return { bid: null, ask: null, spread: null };
    }
    const book = (await res.json()) as {
      bids?: Array<{ price?: string | number }>;
      asks?: Array<{ price?: string | number }>;
    };
    const bidRaw = book.bids?.[0]?.price;
    const askRaw = book.asks?.[0]?.price;
    const bid = bidRaw === undefined ? null : Number(bidRaw);
    const ask = askRaw === undefined ? null : Number(askRaw);
    if (bid === null || ask === null || !Number.isFinite(bid) || !Number.isFinite(ask)) {
      return { bid: null, ask: null, spread: null };
    }
    return { bid, ask, spread: ask - bid };
  } catch {
    return { bid: null, ask: null, spread: null };
  }
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
    minEdgePct: toNumber(map.min_edge_pct, 15),
    maxPositionUsd: toNumber(map.max_position_usd, 10),
    kellyFraction: toNumber(map.kelly_fraction, 0.25),
    dailyLossLimitUsd: toNumber(map.daily_loss_limit_usd, -20),
    minTradeUsd: toNumber(map.min_trade_usd, 0.75),
    topEdgesConsidered: Math.max(1, Math.floor(toNumber(map.top_edges_considered, 12))),
    maxTradesPerScan: Math.max(1, Math.floor(toNumber(map.max_trades_per_scan, 5))),
    maxTradesPerCity: Math.max(1, Math.floor(toNumber(map.max_trades_per_city, 2))),
    maxSpread: toNumber(map.max_spread, 0.35),
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
    const limitedEdges = edges.slice(0, Math.max(1, settings.topEdgesConsidered));

    // 6. Size & execute each edge
    const dailyPnl = await getDailyPnl();
    const positions = await getPositionMap();
    const results: ScanResult[] = [];
    let tradesPlaced = 0;
    const tradesPerCity = new Map<string, number>();
    const tradedMarkets = new Set<string>();

    // Mark all non-top-N edges as skipped so dashboard clearly shows why.
    for (const signal of edges.slice(limitedEdges.length)) {
      results.push({
        signal,
        decision: "SKIPPED",
        skipReason: "top_n_filter",
      });
    }

    for (const signal of limitedEdges) {
      if (tradesPlaced >= settings.maxTradesPerScan) {
        results.push({
          signal,
          decision: "SKIPPED",
          skipReason: "scan_trade_cap",
        });
        continue;
      }

      const cityCount = tradesPerCity.get(signal.market.citySlug) ?? 0;
      if (cityCount >= settings.maxTradesPerCity) {
        results.push({
          signal,
          decision: "SKIPPED",
          skipReason: "city_trade_cap",
        });
        continue;
      }

      if (tradedMarkets.has(signal.market.conditionId)) {
        results.push({
          signal,
          decision: "SKIPPED",
          skipReason: "market_already_traded",
        });
        continue;
      }

      // Use executable CLOB prices, not Gamma snapshot prices.
      const top = await fetchBookTop(signal.bracket.tokenId);
      if (top.bid === null || top.ask === null || top.spread === null) {
        results.push({
          signal,
          decision: "SKIPPED",
          skipReason: "book_too_thin",
        });
        continue;
      }

      // Recompute edge on executable price:
      // BUY uses ask, SELL uses bid.
      const executablePrice = signal.side === "BUY" ? top.ask : top.bid;
      const executableEdge =
        signal.side === "BUY"
          ? (signal.forecastProb - executablePrice) * 100
          : (executablePrice - signal.forecastProb) * 100;
      if (executableEdge < settings.minEdgePct) {
        results.push({
          signal: {
            ...signal,
            marketPrice: executablePrice,
            edgePct: executableEdge,
          },
          decision: "SKIPPED",
          skipReason: "edge_below_threshold",
        });
        continue;
      }

      const pricedSignal = {
        ...signal,
        marketPrice: executablePrice,
        edgePct: executableEdge,
      };

      // Guard against extremely wide/illiquid books after capturing tradable context.
      if (top.spread > settings.maxSpread) {
        results.push({
          signal: pricedSignal,
          decision: "SKIPPED",
          skipReason: "book_too_thin",
        });
        continue;
      }

      const { sizeUsd, skipReason } = sizeTrade(
        pricedSignal,
        settings,
        dailyPnl,
        positions,
      );

      if (sizeUsd <= 0 || skipReason) {
        results.push({
          signal: pricedSignal,
          decision: "SKIPPED",
          skipReason: skipReason ?? "edge_below_threshold",
        });
        continue;
      }

      // Execute trade
      const tradeResult =
        settings.mode === "live"
          ? await executeLive(pricedSignal, sizeUsd)
          : executePaper(pricedSignal, sizeUsd);

      if (tradeResult.status === "REJECTED") {
        results.push({
          signal: pricedSignal,
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
          bracket_label: pricedSignal.bracket.label,
          target_date: pricedSignal.market.targetDate,
          side: pricedSignal.side,
          size_usd: sizeUsd,
          size_shares: tradeResult.sizeShares,
          price: pricedSignal.marketPrice,
          fill_price: tradeResult.fillPrice,
          edge_pct: pricedSignal.edgePct,
          forecast_prob: pricedSignal.forecastProb,
          market_prob: pricedSignal.marketPrice,
          mode: settings.mode,
          status: tradeResult.status,
          outcome: "PENDING",
          order_id: tradeResult.orderId ?? "",
          condition_id: pricedSignal.market.conditionId,
          token_id: pricedSignal.bracket.tokenId,
        })
        .select("id")
        .single();

      positions.set(
        pricedSignal.bracket.tokenId,
        (positions.get(pricedSignal.bracket.tokenId) ?? 0) + sizeUsd,
      );
      tradedMarkets.add(pricedSignal.market.conditionId);
      tradesPerCity.set(pricedSignal.market.citySlug, cityCount + 1);

      results.push({
        signal: pricedSignal,
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

type PendingTradeRow = {
  id: string;
  token_id: string | null;
  side: "BUY" | "SELL";
  fill_price: number | null;
  size_shares: number | null;
  outcome: string;
};

type GammaMarket = {
  closed?: boolean;
  outcomePrices?: string;
};

function parseOutcomePrices(raw: string | undefined): [number, number] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as number[] | string[];
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const yes = Number(arr[0]);
    const no = Number(arr[1]);
    if (!Number.isFinite(yes) || !Number.isFinite(no)) return null;
    return [yes, no];
  } catch {
    return null;
  }
}

async function fetchGammaMarketByToken(tokenId: string): Promise<GammaMarket | null> {
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/markets?clob_token_ids=${encodeURIComponent(tokenId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as GammaMarket[] | unknown;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function runResolveCycle(limit = 200): Promise<ResolveSummary> {
  const sb = getServiceSupabase();

  const { data, error } = await sb
    .from("trades")
    .select("id, token_id, side, fill_price, size_shares, outcome")
    .eq("outcome", "PENDING")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch pending trades: ${error.message}`);
  }

  const pending = (data ?? []) as PendingTradeRow[];

  const summary: ResolveSummary = {
    checked: pending.length,
    resolved: 0,
    wins: 0,
    losses: 0,
    skippedOpen: 0,
    errors: 0,
  };

  for (const t of pending) {
    try {
      if (!t.token_id || t.fill_price === null || t.size_shares === null) {
        summary.errors++;
        continue;
      }

      const market = await fetchGammaMarketByToken(t.token_id);
      if (!market) {
        summary.errors++;
        continue;
      }
      if (!market.closed) {
        summary.skippedOpen++;
        continue;
      }

      const prices = parseOutcomePrices(market.outcomePrices);
      if (!prices) {
        summary.errors++;
        continue;
      }
      const payoutYes = prices[0];

      const pnl =
        t.side === "BUY"
          ? (payoutYes - t.fill_price) * t.size_shares
          : (t.fill_price - payoutYes) * t.size_shares;

      const outcome = pnl >= 0 ? "WIN" : "LOSS";

      const { error: updateErr } = await sb
        .from("trades")
        .update({
          outcome,
          pnl: Math.round(pnl * 100) / 100,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", t.id);

      if (updateErr) {
        summary.errors++;
        continue;
      }

      summary.resolved++;
      if (outcome === "WIN") summary.wins++;
      else summary.losses++;
    } catch {
      summary.errors++;
    }
  }

  return summary;
}
