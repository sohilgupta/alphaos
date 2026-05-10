-- CAS pipeline schema
-- Run once in your Supabase SQL editor

create table if not exists portfolio_holdings (
  id           uuid        default gen_random_uuid() primary key,
  user_id      text        not null default 'owner',
  isin         text        not null,
  ticker       text,
  name         text        not null,
  quantity     numeric     not null,
  value        numeric,
  source       text        not null default 'cas',
  updated_at   timestamptz default now()
);

create table if not exists mutual_funds (
  id           uuid        default gen_random_uuid() primary key,
  user_id      text        not null default 'owner',
  isin         text,
  scheme_name  text        not null,
  units        numeric     not null,
  nav          numeric,
  value        numeric,
  updated_at   timestamptz default now()
);

-- ISIN → NSE/BSE ticker lookup (shared + updatable)
create table if not exists isin_ticker_map (
  isin         text        primary key,
  ticker       text        not null,
  exchange     text        not null default 'NSE',
  updated_at   timestamptz default now()
);

-- Indexes
create index if not exists portfolio_holdings_user_idx on portfolio_holdings(user_id);
create index if not exists mutual_funds_user_idx on mutual_funds(user_id);

-- RLS: service role key bypasses RLS, so keep policies restrictive
alter table portfolio_holdings enable row level security;
alter table mutual_funds        enable row level security;
alter table isin_ticker_map     enable row level security;

-- Only service role can read/write (app uses SERVICE_ROLE_KEY server-side)
create policy "service only" on portfolio_holdings using (false);
create policy "service only" on mutual_funds        using (false);
create policy "service only" on isin_ticker_map     using (false);
