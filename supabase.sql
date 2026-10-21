-- Database setup for accounts and saving (Supabase). Paste this whole file into the Supabase SQL Editor and run it once.
--
-- profiles:     one row per player, holds their character and progress. A player can read and change ONLY their own row.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  character  jsonb not null default '{}'::jsonb,
  progress   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Supabase no longer grants API access to new tables automatically (from 30 October 2026), so say who may reach this one.
-- Players (logged in) can read, add and change rows, and the row-level-security rules below limit them to their own row. The public
-- (anon) key gets nothing. The server-side service role is given full access.
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;

create policy "read own profile"   on public.profiles for select using (auth.uid() = user_id);
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "update own profile" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- keep saved data small: refuse a character or progress blob over 20 KB
alter table public.profiles drop constraint if exists profiles_size_check;
alter table public.profiles add constraint profiles_size_check
  check (pg_column_size(character) < 20000 and pg_column_size(progress) < 20000);
