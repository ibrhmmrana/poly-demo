import { createServerSupabase } from "./supabase-server";
import type { Trade, SummaryStats, ScanRow, MarketRow, SignalRow, DailyPnl } from "./types";

const sb = () => createServerSupabase();

export async function getSummaryStats(): Promise<SummaryStats> {
  const supabase = sb();

  const { data: trades } = await supabase
    .from("trades")
    .select("pnl, outcome, status, mode")
    .eq("status", "FILLED");

  const { data: settingsRows } = await supabase
    .from("bot_settings")
    .select("key, value");

  const settings: Record<string, string> = {};
  settingsRows?.forEach((r) => (settings[r.key] = r.value));

  const rows = trades ?? [];
  const total = rows.length;
  const wins = rows.filter((r) => r.outcome === "WIN").length;
  const losses = rows.filter((r) => r.outcome === "LOSS").length;
  const pending = rows.filter((r) => r.outcome === "PENDING").length;
  const totalPnl = rows.reduce((s, r) => s + (r.pnl ?? 0), 0);
  const resolved = rows.filter((r) => r.outcome !== "PENDING");
  const avgPnl = resolved.length > 0 ? totalPnl / resolved.length : 0;

  const today = new Date().toISOString().slice(0, 10);
  const { data: dailyRow } = await supabase
    .from("daily_pnl")
    .select("realized, num_trades")
    .eq("date", today)
    .maybeSingle();

  return {
    total_trades: total,
    wins,
    losses,
    total_pnl: totalPnl,
    avg_pnl: avgPnl,
    today_pnl: dailyRow?.realized ?? 0,
    today_trades: dailyRow?.num_trades ?? 0,
    pending,
    mode: settings.mode ?? "paper",
  };
}

export async function getCumulativePnl() {
  const { data } = await sb()
    .from("trades")
    .select("created_at, pnl")
    .eq("status", "FILLED")
    .neq("outcome", "PENDING")
    .order("created_at", { ascending: true });

  let running = 0;
  return (data ?? []).map((r) => {
    running += r.pnl;
    return { time: r.created_at, pnl: Math.round(running * 100) / 100 };
  });
}

export async function getPnlByCity() {
  const { data } = await sb()
    .from("trades")
    .select("city_slug, pnl, outcome")
    .eq("status", "FILLED");

  const buckets: Record<string, { city_slug: string; trades: number; wins: number; pnl: number }> = {};
  (data ?? []).forEach((r) => {
    if (!buckets[r.city_slug]) {
      buckets[r.city_slug] = { city_slug: r.city_slug, trades: 0, wins: 0, pnl: 0 };
    }
    buckets[r.city_slug].trades++;
    if (r.outcome === "WIN") buckets[r.city_slug].wins++;
    buckets[r.city_slug].pnl += r.pnl;
  });

  return Object.values(buckets).sort((a, b) => b.pnl - a.pnl);
}

export async function getDailyHistory(): Promise<DailyPnl[]> {
  const { data } = await sb()
    .from("daily_pnl")
    .select("date, realized, num_trades")
    .order("date", { ascending: true });
  return (data ?? []) as DailyPnl[];
}

export async function getOpenPositions() {
  const { data } = await sb()
    .from("trades")
    .select("city_slug, bracket_label, side, size_usd, fill_price, edge_pct")
    .eq("status", "FILLED")
    .eq("outcome", "PENDING");

  const groups: Record<string, {
    city_slug: string; bracket_label: string; side: string;
    total_size: number; price_sum: number; edge_sum: number; count: number;
  }> = {};

  (data ?? []).forEach((r) => {
    const key = `${r.city_slug}|${r.bracket_label}|${r.side}`;
    if (!groups[key]) {
      groups[key] = {
        city_slug: r.city_slug, bracket_label: r.bracket_label, side: r.side,
        total_size: 0, price_sum: 0, edge_sum: 0, count: 0,
      };
    }
    const g = groups[key];
    g.total_size += r.size_usd;
    g.price_sum += r.fill_price;
    g.edge_sum += r.edge_pct;
    g.count++;
  });

  return Object.values(groups).map((g) => ({
    city_slug: g.city_slug,
    bracket_label: g.bracket_label,
    side: g.side,
    total_size: Math.round(g.total_size * 100) / 100,
    avg_price: Math.round((g.price_sum / g.count) * 10000) / 10000,
    avg_edge: Math.round((g.edge_sum / g.count) * 10) / 10,
    count: g.count,
  }));
}

export async function getTrades(limit = 200) {
  const { data } = await sb()
    .from("trades")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Trade[];
}

export async function getScans(limit = 50): Promise<ScanRow[]> {
  const { data } = await sb()
    .from("scans")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ScanRow[];
}

export async function getMarkets(): Promise<MarketRow[]> {
  const { data } = await sb()
    .from("markets")
    .select("*")
    .order("last_seen_at", { ascending: false });
  return (data ?? []) as MarketRow[];
}

export async function getSignals(limit = 200): Promise<SignalRow[]> {
  const { data } = await sb()
    .from("signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as SignalRow[];
}

export async function getBotSettings() {
  const { data } = await sb()
    .from("bot_settings")
    .select("key, value, updated_at");
  const map: Record<string, string> = {};
  (data ?? []).forEach((r) => (map[r.key] = r.value));
  return map;
}
