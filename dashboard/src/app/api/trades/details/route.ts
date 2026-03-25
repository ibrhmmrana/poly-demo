import { NextResponse } from "next/server";

type GammaMarket = {
  question?: string;
  slug?: string;
  conditionId?: string;
  endDate?: string;
  outcomes?: string[];
  outcomePrices?: string;
  closed?: boolean;
  active?: boolean;
  groupItemTitle?: string;
  umaResolutionStatus?: string;
  resolutionSource?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tokenId = searchParams.get("token_id")?.trim();
  const conditionId = searchParams.get("condition_id")?.trim();

  if (!tokenId && !conditionId) {
    return NextResponse.json(
      { error: "Missing token_id or condition_id" },
      { status: 400 },
    );
  }

  try {
    const url = tokenId
      ? `https://gamma-api.polymarket.com/markets?clob_token_ids=${encodeURIComponent(tokenId)}`
      : `https://gamma-api.polymarket.com/markets?conditionId=${encodeURIComponent(conditionId!)}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Gamma request failed (${res.status})` },
        { status: 502 },
      );
    }

    const rows = (await res.json()) as GammaMarket[] | unknown;
    const market = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      market: {
        question: market.question ?? null,
        slug: market.slug ?? null,
        conditionId: market.conditionId ?? null,
        endDate: market.endDate ?? null,
        closed: market.closed ?? null,
        active: market.active ?? null,
        umaResolutionStatus: market.umaResolutionStatus ?? null,
        resolutionSource: market.resolutionSource ?? null,
        groupItemTitle: market.groupItemTitle ?? null,
        outcomes: market.outcomes ?? null,
        outcomePrices: market.outcomePrices ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch details" },
      { status: 500 },
    );
  }
}

