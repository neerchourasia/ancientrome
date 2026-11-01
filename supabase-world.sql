-- Keeps the game server's shared world between restarts (Supabase). Paste this whole file into the Supabase SQL Editor and run it once.
--
-- world_state: one row per kind of shared thing (guilds, share prices, leaderboards, race times, the pyramid). Only the game server (with the service key) can touch it:
--              players and the public key get nothing.
-- balances:    for later: each player's denarii, when the server holds the money.

create table if not exists public.world_state (
  key        text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.world_state enable row level security;
revoke all on public.world_state from anon, authenticated;
grant select, insert, update, delete on public.world_state to service_role;

-- keep each row small
alter table public.world_state drop constraint if exists world_state_size_check;
alter table public.world_state add constraint world_state_size_check check (pg_column_size(data) < 2000000);

create table if not exists public.balances (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  coins      bigint not null default 0 check (coins >= 0),
  updated_at timestamptz not null default now()
);

alter table public.balances enable row level security;
revoke all on public.balances from anon, authenticated;
grant select, insert, update, delete on public.balances to service_role;
