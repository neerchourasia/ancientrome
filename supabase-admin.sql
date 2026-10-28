-- Admin tools (run once in the Supabase SQL Editor, AFTER supabase.sql).
-- Replace YOUR_EMAIL@example.com below with the email you sign in to the game with.
--
-- What it gives an admin account:
--   * the game server asks is_admin() whether a login is an admin (for chat moderation: /mute, /kick, /say)
--   * the Admin panel in the game lists who has signed up (email, character, when they joined, when they last logged in)
-- Nobody else can read the list or the admins table: both are locked to the admin emails.

create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;          -- no policies: the game's public key cannot read or change it
-- (explicit grant, since Supabase stopped granting API access to new tables automatically on 30 October 2026: only the service role)
grant select, insert, update, delete on public.admins to service_role;

insert into public.admins (email) values (lower('YOUR_EMAIL@example.com')) on conflict do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

drop function if exists public.admin_users();
create or replace function public.admin_users()
returns table (email text, created_at timestamptz, last_sign_in_at timestamptz, character_name text, class_name text, saved_at timestamptz, coins numeric, game_day numeric, items integer)
language sql stable security definer set search_path = public, auth as $$
  select u.email::text, u.created_at, u.last_sign_in_at, p.character ->> 'name', p.character ->> 'cls', p.updated_at,
         (p.progress -> 'vitals' ->> 'coins')::numeric, (p.progress -> 'time' ->> 'day')::numeric,
         coalesce(jsonb_array_length(p.progress -> 'owned' -> 'items'), 0)
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where public.is_admin()
  order by u.created_at desc;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_users() to authenticated;
