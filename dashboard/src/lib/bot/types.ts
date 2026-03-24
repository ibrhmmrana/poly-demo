export interface City {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  tempUnit: "F" | "C";
  bracketSize: number;
}

export interface Bracket {
  tokenId: string;
  label: string;
  low: number | null;
  high: number | null;
  marketPrice: number;
}

export interface Market {
  conditionId: string;
  question: string;
  citySlug: string;
  targetDate: string;
  endDate: string;
  brackets: Bracket[];
  hoursToResolution: number;
}

export interface Forecast {
  citySlug: string;
  targetDate: string;
  pointForecast: number;
  source: string;
  probabilities: Record<string, number>;
  rawHourly: number[];
  fetchedAt: Date;
}

export type Side = "BUY" | "SELL";

export interface EdgeSignal {
  market: Market;
  bracket: Bracket;
  side: Side;
  forecastProb: number;
  marketPrice: number;
  edgePct: number;
}

export type Decision = "TRADED" | "SKIPPED";

export type SkipReason =
  | "edge_below_threshold"
  | "book_too_thin"
  | "daily_limit_hit"
  | "position_limit"
  | "kelly_negative"
  | "min_size"
  | "top_n_filter"
  | "scan_trade_cap"
  | "city_trade_cap"
  | "market_already_traded"
  | "bot_paused"
  | "execution_failed";

export interface ScanResult {
  signal: EdgeSignal;
  decision: Decision;
  skipReason?: SkipReason;
  tradeSizeUsd?: number;
  tradeId?: string;
}

export interface ScanSummary {
  scanId: number;
  duration: number;
  marketsFound: number;
  edgesFound: number;
  tradesPlaced: number;
  mode: string;
  results: ScanResult[];
  error?: string;
}

export interface ResolveSummary {
  checked: number;
  resolved: number;
  wins: number;
  losses: number;
  skippedOpen: number;
  errors: number;
}

export interface BotSettings {
  mode: "paper" | "live";
  botPaused: boolean;
  minEdgePct: number;
  maxPositionUsd: number;
  kellyFraction: number;
  dailyLossLimitUsd: number;
  minTradeUsd: number;
  topEdgesConsidered: number;
  maxTradesPerScan: number;
  maxTradesPerCity: number;
  maxSpread: number;
}
