-- Polymarket Weather Bot v2 — Serverless schema
-- Run this in the Supabase SQL Editor.
-- WARNING: This drops ALL v1 tables. Only run once on a fresh migration.

-- ══════════════════════════════════════════════════════════════════════
-- 0. Remove old v1 tables from Realtime, then drop them
-- ══════════════════════════════════════════════════════════════════════
do $$
begin
  -- Remove from realtime publication (ignore if not present)
  begin alter publication supabase_realtime drop table trades;       exception when others then null; end;
  begin alter publication supabase_realtime drop table daily_pnl;    exception when others then null; end;
  begin alter publication supabase_realtime drop table markets;      exception when others then null; end;
  begin alter publication supabase_realtime drop table scans;        exception when others then null; end;
  begin alter publication supabase_realtime drop table signals;      exception when others then null; end;
  begin alter publication supabase_realtime drop table bot_settings; exception when others then null; end;
  begin alter publication supabase_realtime drop table scan_cycles;  exception when others then null; end;
  begin alter publication supabase_realtime drop table scan_results; exception when others then null; end;
end $$;

drop table if exists signals    cascade;
drop table if exists scans      cascade;
drop table if exists markets    cascade;
drop table if exists daily_pnl  cascade;
drop table if exists trades     cascade;
drop table if exists bot_settings cascade;
drop table if exists scan_results cascade;
drop table if exists scan_cycles  cascade;

-- ══════════════════════════════════════════════════════════════════════
-- 1. scan_cycles  (one row per scan invocation)
-- ══════════════════════════════════════════════════════════════════════
create table scan_cycles (
  id              bigint generated always as identity primary key,
  triggered_at    timestamptz not null default now(),
  completed_at    timestamptz,
  duration_ms     integer,
  markets_found   integer not null default 0,
  edges_found     integer not null default 0,
  trades_placed   integer not null default 0,
  mode            text not null default 'paper',
  status          text not null default 'running'
                    check (status in ('running','completed','error')),
  error_message   text,
  trigger_source  text default 'api'
);

create index idx_scan_cycles_triggered on scan_cycles(triggered_at desc);

-- ══════════════════════════════════════════════════════════════════════
-- 2. scan_results  (one row per detected edge in a scan)
-- ══════════════════════════════════════════════════════════════════════
create table scan_results (
  id              bigint generated always as identity primary key,
  scan_id         bigint not null references scan_cycles(id) on delete cascade,
  city            text not null,
  target_date     date not null,
  question        text,
  bracket_label   text not null,
  side            text not null check (side in ('BUY','SELL')),
  market_price    real not null,
  forecast_prob   real not null,
  edge_pct        real not null,
  decision        text not null check (decision in ('TRADED','SKIPPED')),
  skip_reason     text,
  trade_size_usd  real,
  condition_id    text,
  token_id        text,
  created_at      timestamptz not null default now()
);

create index idx_scan_results_scan     on scan_results(scan_id);
create index idx_scan_results_created  on scan_results(created_at desc);
create index idx_scan_results_decision on scan_results(decision);

-- ══════════════════════════════════════════════════════════════════════
-- 3. trades  (actual executions)
-- ══════════════════════════════════════════════════════════════════════
create table trades (
  id              text primary key default gen_random_uuid()::text,
  scan_id         bigint references scan_cycles(id),
  scan_result_id  bigint references scan_results(id),
  city            text not null,
  bracket_label   text not null,
  target_date     date,
  side            text not null check (side in ('BUY','SELL')),
  size_usd        real not null,
  size_shares     real,
  price           real not null,
  fill_price      real,
  edge_pct        real,
  forecast_prob   real,
  market_prob     real,
  mode            text not null default 'paper',
  status          text not null default 'FILLED',
  outcome         text default 'PENDING'
                    check (outcome in ('WIN','LOSS','PENDING')),
  pnl             real default 0,
  order_id        text,
  condition_id    text,
  token_id        text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create index idx_trades_created on trades(created_at desc);
create index idx_trades_city    on trades(city);
create index idx_trades_outcome on trades(outcome);
create index idx_trades_mode    on trades(mode);

-- ══════════════════════════════════════════════════════════════════════
-- 4. bot_settings  (dashboard-controlled config)
-- ══════════════════════════════════════════════════════════════════════
create table bot_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

insert into bot_settings (key, value) values
  ('mode',                 'paper'),
  ('bot_paused',           'false'),
  ('min_edge_pct',         '15'),
  ('max_position_usd',     '10'),
  ('kelly_fraction',       '0.25'),
  ('daily_loss_limit_usd', '-20'),
  ('min_trade_usd',        '0.75'),
  ('top_edges_considered', '12'),
  ('max_trades_per_scan',  '5'),
  ('max_trades_per_city',  '2');

-- ══════════════════════════════════════════════════════════════════════
-- Realtime
-- ══════════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table scan_cycles;
alter publication supabase_realtime add table scan_results;
alter publication supabase_realtime add table trades;
alter publication supabase_realtime add table bot_settings;

-- ══════════════════════════════════════════════════════════════════════
-- RLS  (permissive — service role bypasses; dashboard uses anon key)
-- ══════════════════════════════════════════════════════════════════════
alter table scan_cycles  enable row level security;
alter table scan_results enable row level security;
alter table trades       enable row level security;
alter table bot_settings enable row level security;

create policy "allow_all" on scan_cycles  for all using (true) with check (true);
create policy "allow_all" on scan_results for all using (true) with check (true);
create policy "allow_all" on trades       for all using (true) with check (true);
create policy "allow_all" on bot_settings for all using (true) with check (true);
