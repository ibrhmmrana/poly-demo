import { createClient } from "@supabase/supabase-js";
import { discoverMarkets } from "./scanner";
import { getForecasts } from "./forecast";
import { findEdges } from "./edge";
import { sizeTrade } from "./risk";
import { executePaper, executeLive } from "./trader";
import { CITIES } from "./cities";
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

interface ExistingPosition {
  positionByToken: Map<string, number>;
  tradedTokens: Set<string>;
  tradedConditions: Set<string>;
}

async function getExistingPositions(): Promise<ExistingPosition> {
  const sb = getServiceSupabase();
  const { data } = await sb
    .from("trades")
    .select("token_id, condition_id, size_usd, outcome")
    .in("outcome", ["PENDING", "WIN", "LOSS"]);
  const positionByToken = new Map<string, number>();
  const tradedTokens = new Set<string>();
  const tradedConditions = new Set<string>();
  for (const r of data ?? []) {
    const tid = (r as { token_id: string }).token_id;
    const cid = (r as { condition_id: string }).condition_id;
    const usd = (r as { size_usd: number }).size_usd ?? 0;
    const outcome = (r as { outcome: string }).outcome;
    if (tid) tradedTokens.add(tid);
    if (cid) tradedConditions.add(cid);
    if (outcome === "PENDING") {
      positionByToken.set(tid, (positionByToken.get(tid) ?? 0) + usd);
    }
  }
  return { positionByToken, tradedTokens, tradedConditions };
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
    const existing = await getExistingPositions();
    const positions = existing.positionByToken;
    const results: ScanResult[] = [];
    let tradesPlaced = 0;
    const tradesPerCity = new Map<string, number>();
    const tradedMarkets = new Set(existing.tradedConditions);

    let executionEligibleCount = 0;
    let tradableCandidateCount = 0;

    for (const signal of edges) {
      let pricedSignal = signal;

      if (settings.mode === "live") {
        // LIVE MODE: verify edge against real CLOB order book for limit orders.
        // We still fetch the book to ensure it exists and to log the spread,
        // but we use the mid-price for limit-order placement rather than
        // trying to cross the spread.
        const top = await fetchBookTop(signal.bracket.tokenId);
        if (top.bid === null || top.ask === null || top.spread === null) {
          results.push({
            signal,
            decision: "SKIPPED",
            skipReason: "book_too_thin",
          });
          continue;
        }

        const mid = (top.bid + top.ask) / 2;
        const midEdge =
          signal.side === "BUY"
            ? (signal.forecastProb - mid) * 100
            : (mid - signal.forecastProb) * 100;

        pricedSignal = {
          ...signal,
          marketPrice: mid,
          edgePct: midEdge,
        };

        if (midEdge < settings.minEdgePct) {
          results.push({
            signal: pricedSignal,
            decision: "SKIPPED",
            skipReason: "edge_below_threshold",
          });
          continue;
        }
      }
      // PAPER MODE: use Gamma indicative prices already in signal.
      // These represent the market's "mid" estimate and are suitable
      // for simulation; no CLOB repricing needed.

      tradableCandidateCount++;

      if (executionEligibleCount >= settings.topEdgesConsidered) {
        results.push({
          signal: pricedSignal,
          decision: "SKIPPED",
          skipReason: "top_n_filter",
        });
        continue;
      }
      executionEligibleCount++;

      if (tradesPlaced >= settings.maxTradesPerScan) {
        results.push({
          signal: pricedSignal,
          decision: "SKIPPED",
          skipReason: "scan_trade_cap",
        });
        continue;
      }

      const cityCount = tradesPerCity.get(pricedSignal.market.citySlug) ?? 0;
      if (cityCount >= settings.maxTradesPerCity) {
        results.push({
          signal: pricedSignal,
          decision: "SKIPPED",
          skipReason: "city_trade_cap",
        });
        continue;
      }

      if (existing.tradedTokens.has(pricedSignal.bracket.tokenId)) {
        results.push({
          signal: pricedSignal,
          decision: "SKIPPED",
          skipReason: "market_already_traded",
        });
        continue;
      }

      if (tradedMarkets.has(pricedSignal.market.conditionId)) {
        results.push({
          signal: pricedSignal,
          decision: "SKIPPED",
          skipReason: "market_already_traded",
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

      // Execute trade.
      // Live mode places GTC limit orders at our target price instead of
      // crossing the (usually very wide) spread.
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
      existing.tradedTokens.add(pricedSignal.bracket.tokenId);
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
        edges_found: tradableCandidateCount,
        trades_placed: tradesPlaced,
      })
      .eq("id", scanId);

    return {
      scanId,
      duration,
      marketsFound: markets.length,
      edgesFound: tradableCandidateCount,
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
  city: string | null;
  bracket_label: string | null;
  target_date: string | null;
  mode: string | null;
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

/* ------------------------------------------------------------------ */
/*  Weather-based self-resolution for paper trades                     */
/* ------------------------------------------------------------------ */

async function fetchActualHighC(
  lat: number,
  lon: number,
  dateStr: string,
): Promise<number | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      daily?: { temperature_2m_max?: (number | null)[] };
    };
    const temps = body?.daily?.temperature_2m_max;
    if (!Array.isArray(temps) || temps.length === 0 || temps[0] === null)
      return null;
    return temps[0];
  } catch {
    return null;
  }
}

function parseBracketBounds(
  label: string,
): { low: number | null; high: number | null } | null {
  let m: RegExpMatchArray | null;

  m = label.match(/(\d+)\s*°[FC]\s*or\s*higher/i);
  if (m) return { low: +m[1], high: null };

  m = label.match(/(\d+)\s*°[FC]\s*or\s*(?:below|lower)/i);
  if (m) return { low: null, high: +m[1] };

  m = label.match(/(\d+)\s*-\s*(\d+)/);
  if (m) return { low: +m[1], high: +m[2] };

  m = label.match(/^(\d+)\s*°[FC]$/);
  if (m) return { low: +m[1], high: +m[1] };

  return null;
}

function isBracketHit(
  actualTemp: number,
  bounds: { low: number | null; high: number | null },
): boolean {
  if (bounds.low !== null && bounds.high !== null)
    return actualTemp >= bounds.low && actualTemp <= bounds.high;
  if (bounds.low !== null) return actualTemp >= bounds.low;
  if (bounds.high !== null) return actualTemp <= bounds.high;
  return false;
}

/* ------------------------------------------------------------------ */

export async function runResolveCycle(limit = 200): Promise<ResolveSummary> {
  const sb = getServiceSupabase();

  const { data, error } = await sb
    .from("trades")
    .select(
      "id, token_id, side, fill_price, size_shares, outcome, city, bracket_label, target_date, mode",
    )
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

  // Cache weather lookups so we don't re-fetch the same city+date.
  const weatherCache = new Map<string, number | null>();

  const todayUTC = new Date().toISOString().slice(0, 10);

  for (const t of pending) {
    try {
      if (t.fill_price === null || t.size_shares === null) {
        summary.errors++;
        continue;
      }

      /* --- Path 1: Polymarket official resolution (live trades) --- */
      if (t.token_id) {
        const market = await fetchGammaMarketByToken(t.token_id);
        if (market?.closed) {
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
          continue;
        }
      }

      /* --- Path 2: Self-resolve paper trades via actual weather --- */
      if (
        t.mode !== "paper" ||
        !t.city ||
        !t.bracket_label ||
        !t.target_date
      ) {
        summary.skippedOpen++;
        continue;
      }

      // Only resolve dates that are not in the future.
      // Today's date is allowed because by the time a resolver runs,
      // the daily high is effectively finalized for paper purposes.
      if (t.target_date > todayUTC) {
        summary.skippedOpen++;
        continue;
      }

      const cityInfo = CITIES[t.city];
      if (!cityInfo) {
        summary.errors++;
        continue;
      }

      const cacheKey = `${t.city}:${t.target_date}`;
      let actualHighC: number | null;
      if (weatherCache.has(cacheKey)) {
        actualHighC = weatherCache.get(cacheKey)!;
      } else {
        actualHighC = await fetchActualHighC(
          cityInfo.lat,
          cityInfo.lon,
          t.target_date,
        );
        weatherCache.set(cacheKey, actualHighC);
      }

      if (actualHighC === null) {
        summary.errors++;
        continue;
      }

      const actualHigh =
        cityInfo.tempUnit === "F"
          ? Math.round(actualHighC * (9 / 5) + 32)
          : Math.round(actualHighC);

      const bounds = parseBracketBounds(t.bracket_label);
      if (!bounds) {
        summary.errors++;
        continue;
      }

      const hit = isBracketHit(actualHigh, bounds);
      const payoutYes = hit ? 1 : 0;

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
