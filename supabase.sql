-- Database setup for accounts and saving (Supabase). Paste this whole file into the Supabase SQL Editor and run it once.
--
-- profiles:     one row per player, holds their character and progress. A player can read and change ONLY their own row.
-- entitlements: what a player has paid for (e.g. premium). A player can READ their own row but can never write it:
--               only the server (your payment webhook, using the service_role key) is allowed to grant premium.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  character  jsonb not null default '{}'::jsonb,
  progress   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.entitlements (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  premium    boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profiles     enable row level security;
alter table public.entitlements enable row level security;

drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;
drop policy if exists "read own entitlements" on public.entitlements;

create policy "read own profile"   on public.profiles for select using (auth.uid() = user_id);
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "update own profile" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- no insert / update / delete policy on entitlements: players cannot grant themselves premium
create policy "read own entitlements" on public.entitlements for select using (auth.uid() = user_id);

-- keep saved data small: refuse a character or progress blob over 20 KB
alter table public.profiles drop constraint if exists profiles_size_check;
alter table public.profiles add constraint profiles_size_check
  check (pg_column_size(character) < 20000 and pg_column_size(progress) < 20000);
