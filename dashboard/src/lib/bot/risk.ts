import type { BotSettings, EdgeSignal, SkipReason } from "./types";

export interface SizeResult {
  sizeUsd: number;
  skipReason?: SkipReason;
}

export function sizeTrade(
  signal: EdgeSignal,
  settings: BotSettings,
  dailyPnl: number,
  positionByToken: Map<string, number>,
): SizeResult {
  // Daily loss guard
  if (dailyPnl <= settings.dailyLossLimitUsd) {
    return { sizeUsd: 0, skipReason: "daily_limit_hit" };
  }

  const p = signal.forecastProb;
  const q = 1 - p;
  const mp = signal.marketPrice;

  if (mp <= 0 || mp >= 1) {
    return { sizeUsd: 0, skipReason: "kelly_negative" };
  }

  let b: number;
  let pAdj = p;
  let qAdj = q;

  if (signal.side === "BUY") {
    b = (1 - mp) / mp;
  } else {
    b = mp / (1 - mp);
    pAdj = q;
    qAdj = p;
  }

  if (b <= 0) return { sizeUsd: 0, skipReason: "kelly_negative" };

  const kelly = (b * pAdj - qAdj) / b;
  if (kelly <= 0) return { sizeUsd: 0, skipReason: "kelly_negative" };

  let size = kelly * settings.kellyFraction * settings.maxPositionUsd;
  size = Math.min(size, settings.maxPositionUsd);

  // Per-token position cap
  const existing = positionByToken.get(signal.bracket.tokenId) ?? 0;
  if (existing + size > settings.maxPositionUsd) {
    size = Math.max(settings.maxPositionUsd - existing, 0);
  }
  if (size <= 0) return { sizeUsd: 0, skipReason: "position_limit" };

  if (size < settings.minTradeUsd) {
    return { sizeUsd: 0, skipReason: "min_size" };
  }

  return { sizeUsd: Math.round(size * 100) / 100 };
}
