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

export interface BotSettings {
  mode: "paper" | "live";
  botPaused: boolean;
  minEdgePct: number;
  maxPositionUsd: number;
  kellyFraction: number;
  dailyLossLimitUsd: number;
}
