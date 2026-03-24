import type { EdgeSignal, Forecast, Market } from "./types";

export function findEdges(
  markets: Market[],
  forecasts: Map<string, Forecast>,
  minEdgePct: number,
): EdgeSignal[] {
  const signals: EdgeSignal[] = [];

  for (const market of markets) {
    const key = `${market.citySlug}:${market.targetDate}`;
    const forecast = forecasts.get(key);
    if (!forecast || !Object.keys(forecast.probabilities).length) continue;

    for (const bracket of market.brackets) {
      const forecastProb = forecast.probabilities[bracket.label] ?? 0;
      const marketPrice = bracket.marketPrice;
      if (marketPrice <= 0 || marketPrice >= 1) continue;

      const edgeBuy = (forecastProb - marketPrice) * 100;
      const edgeSell = (marketPrice - forecastProb) * 100;

      if (edgeBuy >= minEdgePct) {
        signals.push({
          market,
          bracket,
          side: "BUY",
          forecastProb,
          marketPrice,
          edgePct: edgeBuy,
        });
      } else if (edgeSell >= minEdgePct) {
        signals.push({
          market,
          bracket,
          side: "SELL",
          forecastProb,
          marketPrice,
          edgePct: edgeSell,
        });
      }
    }
  }

  signals.sort((a, b) => b.edgePct - a.edgePct);
  return signals;
}
