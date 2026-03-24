export interface Database {
  public: {
    Tables: {
      trades: {
        Row: Trade;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      daily_pnl: {
        Row: DailyPnl;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      markets: {
        Row: MarketRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      scans: {
        Row: ScanRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      signals: {
        Row: SignalRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      bot_settings: {
        Row: BotSetting;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
  };
}

export interface Trade {
  id: string;
  market_condition_id: string;
  bracket_token_id: string;
  bracket_label: string;
  city_slug: string;
  side: "BUY" | "SELL";
  price: number;
  size_usd: number;
  size_shares: number;
  forecast_prob: number;
  market_prob: number;
  edge_pct: number;
  status: string;
  mode: string;
  order_id: string;
  fill_price: number;
  pnl: number;
  outcome: "WIN" | "LOSS" | "PENDING";
  created_at: string;
  resolved_at: string | null;
}

export interface DailyPnl {
  date: string;
  realized: number;
  unrealized: number;
  num_trades: number;
}

export interface MarketRow {
  condition_id: string;
  question: string;
  city_slug: string;
  target_date: string;
  end_date: string;
  num_brackets: number;
  brackets_json: BracketJson[];
  active: boolean;
  first_seen_at: string;
  last_seen_at: string;
}

export interface BracketJson {
  label: string;
  token_id: string;
  low: number | null;
  high: number | null;
  market_price: number;
}

export interface ScanRow {
  id: number;
  started_at: string;
  markets_found: number;
  new_markets: number;
  duration_ms: number;
}

export interface SignalRow {
  id: number;
  market_condition_id: string;
  bracket_label: string;
  city_slug: string;
  side: "BUY" | "SELL";
  forecast_prob: number;
  market_prob: number;
  edge_pct: number;
  suggested_size: number;
  acted_on: boolean;
  trade_id: string | null;
  created_at: string;
}

export interface BotSetting {
  key: string;
  value: string;
  updated_at: string;
}

export interface SummaryStats {
  total_trades: number;
  wins: number;
  losses: number;
  total_pnl: number;
  avg_pnl: number;
  today_pnl: number;
  today_trades: number;
  pending: number;
  mode: string;
}
