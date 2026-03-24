import { NextRequest, NextResponse } from "next/server";
import { runScanCycle } from "@/lib/bot/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const apiKey = (process.env.BOT_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "BOT_API_KEY not configured on server" },
      { status: 500 },
    );
  }

  const provided =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (provided !== apiKey) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  try {
    const summary = await runScanCycle();

    return NextResponse.json({
      scanId: summary.scanId,
      duration: summary.duration,
      marketsFound: summary.marketsFound,
      edgesFound: summary.edgesFound,
      tradesPlaced: summary.tradesPlaced,
      mode: summary.mode,
      error: summary.error ?? null,
      results: summary.results.map((r) => ({
        city: r.signal.market.citySlug,
        bracket: r.signal.bracket.label,
        side: r.signal.side,
        forecastProb: Math.round(r.signal.forecastProb * 1000) / 10,
        marketPrice: Math.round(r.signal.marketPrice * 1000) / 10,
        edgePct: Math.round(r.signal.edgePct * 10) / 10,
        decision: r.decision,
        skipReason: r.skipReason ?? null,
        tradeSizeUsd: r.tradeSizeUsd ?? null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
