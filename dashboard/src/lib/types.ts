export interface ScanCycle {
  id: number;
  triggered_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  markets_found: number;
  edges_found: number;
  trades_placed: number;
  mode: string;
  status: string;
  error_message: string | null;
  trigger_source: string | null;
}

export interface ScanResultRow {
  id: number;
  scan_id: number;
  city: string;
  target_date: string;
  question: string | null;
  bracket_label: string;
  side: string;
  market_price: number;
  forecast_prob: number;
  edge_pct: number;
  decision: string;
  skip_reason: string | null;
  trade_size_usd: number | null;
  condition_id: string | null;
  token_id: string | null;
  created_at: string;
}

export interface Trade {
  id: string;
  scan_id: number | null;
  scan_result_id: number | null;
  city: string;
  bracket_label: string;
  target_date: string | null;
  side: string;
  size_usd: number;
  size_shares: number | null;
  price: number;
  fill_price: number | null;
  edge_pct: number | null;
  forecast_prob: number | null;
  market_prob: number | null;
  mode: string;
  status: string;
  outcome: string;
  pnl: number;
  order_id: string | null;
  condition_id: string | null;
  token_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface BotSettingRow {
  key: string;
  value: string;
  updated_at: string;
}
