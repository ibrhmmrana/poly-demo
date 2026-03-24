-- Polymarket Weather Bot — Supabase schema
-- Run this in the Supabase SQL Editor to bootstrap the database.

-- ══════════════════════════════════════════════════════════════════════
-- 1. trades
-- ══════════════════════════════════════════════════════════════════════
create table if not exists trades (
  id                 text primary key,
  market_condition_id text not null,
  bracket_token_id   text not null,
  bracket_label      text not null,
  city_slug          text not null,
  side               text not null check (side in ('BUY','SELL')),
  price              real not null,
  size_usd           real not null,
  size_shares        real not null,
  forecast_prob      real not null,
  market_prob        real not null,
  edge_pct           real not null,
  status             text not null default 'PENDING',
  mode               text not null default 'paper',
  order_id           text default '',
  fill_price         real default 0,
  pnl                real default 0,
  outcome            text default 'PENDING' check (outcome in ('WIN','LOSS','PENDING')),
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

create index if not exists idx_trades_city     on trades(city_slug);
create index if not exists idx_trades_status   on trades(status);
create index if not exists idx_trades_outcome  on trades(outcome);
create index if not exists idx_trades_created  on trades(created_at desc);
create index if not exists idx_trades_mode     on trades(mode);

-- ══════════════════════════════════════════════════════════════════════
-- 2. daily_pnl
-- ══════════════════════════════════════════════════════════════════════
create table if not exists daily_pnl (
  date        date primary key,
  realized    real default 0,
  unrealized  real default 0,
  num_trades  integer default 0
);

-- ══════════════════════════════════════════════════════════════════════
-- 3. markets  (discovered by scanner)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists markets (
  condition_id   text primary key,
  question       text not null,
  city_slug      text not null,
  target_date    date not null,
  end_date       timestamptz not null,
  num_brackets   integer default 0,
  brackets_json  jsonb default '[]'::jsonb,
  active         boolean default true,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

create index if not exists idx_markets_city   on markets(city_slug);
create index if not exists idx_markets_active on markets(active);
create index if not exists idx_markets_date   on markets(target_date);

-- ══════════════════════════════════════════════════════════════════════
-- 4. scans  (one row per scanner run)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists scans (
  id             bigint generated always as identity primary key,
  started_at     timestamptz not null default now(),
  markets_found  integer not null default 0,
  new_markets    integer not null default 0,
  duration_ms    integer default 0
);

-- ══════════════════════════════════════════════════════════════════════
-- 5. signals  (edge signals detected)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists signals (
  id                   bigint generated always as identity primary key,
  market_condition_id  text not null,
  bracket_label        text not null,
  city_slug            text not null,
  side                 text not null check (side in ('BUY','SELL')),
  forecast_prob        real not null,
  market_prob          real not null,
  edge_pct             real not null,
  suggested_size       real default 0,
  acted_on             boolean default false,
  trade_id             text,
  created_at           timestamptz not null default now()
);

create index if not exists idx_signals_city    on signals(city_slug);
create index if not exists idx_signals_created on signals(created_at desc);
create index if not exists idx_signals_acted   on signals(acted_on);

-- ══════════════════════════════════════════════════════════════════════
-- 6. bot_settings  (dashboard-controlled config)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists bot_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

-- Seed defaults
insert into bot_settings (key, value) values
  ('mode',                'paper'),
  ('bot_paused',          'false'),
  ('min_edge_pct',        '15'),
  ('max_position_usd',    '10'),
  ('kelly_fraction',      '0.25'),
  ('daily_loss_limit_usd','-20')
on conflict (key) do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- Enable Realtime on all tables
-- ══════════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table trades;
alter publication supabase_realtime add table daily_pnl;
alter publication supabase_realtime add table markets;
alter publication supabase_realtime add table scans;
alter publication supabase_realtime add table signals;
alter publication supabase_realtime add table bot_settings;

-- ══════════════════════════════════════════════════════════════════════
-- RLS  (service_role bypasses; anon gated by header pin)
-- ══════════════════════════════════════════════════════════════════════
alter table trades       enable row level security;
alter table daily_pnl    enable row level security;
alter table markets      enable row level security;
alter table scans        enable row level security;
alter table signals      enable row level security;
alter table bot_settings enable row level security;

-- Service role can do everything (the Python bot uses this)
create policy "service_all" on trades       for all using (true) with check (true);
create policy "service_all" on daily_pnl    for all using (true) with check (true);
create policy "service_all" on markets      for all using (true) with check (true);
create policy "service_all" on scans        for all using (true) with check (true);
create policy "service_all" on signals      for all using (true) with check (true);
create policy "service_all" on bot_settings for all using (true) with check (true);
