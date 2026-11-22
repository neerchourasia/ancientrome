-- Suggestions and "name a car after me" requests (run once in the Supabase SQL Editor, AFTER supabase.sql and supabase-admin.sql).
--
-- What it gives the game:
--   * the page suggest.html can SAVE a request (anyone, signed in or not, may add one: nobody can read, change or delete them with the public key)
--   * an admin account can read them (Admin page > Suggestions) and tick them off
-- The limits below are checked by the database itself, so they hold even if somebody skips the page and calls the web API directly.

create table if not exists public.suggestions (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('idea', 'car')),
  name        text not null check (char_length(name) between 1 and 60),
  car_type    text check (car_type is null or char_length(car_type) <= 40),
  message     text not null default '' check (char_length(message) <= 1500),
  contact     text check (contact is null or char_length(contact) <= 120),
  user_id     uuid default auth.uid(),
  done        boolean not null default false,
  check (kind = 'car' or char_length(message) >= 3)
);
alter table public.suggestions enable row level security;

drop policy if exists "anyone may send a suggestion" on public.suggestions;
create policy "anyone may send a suggestion" on public.suggestions for insert to anon, authenticated with check (done = false);

-- (explicit grants, since Supabase no longer grants API access to new tables automatically: the public key may only ADD a row)
revoke all on public.suggestions from anon, authenticated;
grant insert (kind, name, car_type, message, contact) on public.suggestions to anon, authenticated;
grant select, insert, update, delete on public.suggestions to service_role;

create or replace function public.admin_suggestions()
returns table (id bigint, created_at timestamptz, kind text, name text, car_type text, message text, contact text, user_email text, done boolean)
language sql stable security definer set search_path = public, auth as $$
  select s.id, s.created_at, s.kind, s.name, s.car_type, s.message, s.contact, u.email::text, s.done
  from public.suggestions s left join auth.users u on u.id = s.user_id
  where public.is_admin()
  order by s.done, s.created_at desc
  limit 500;
$$;

create or replace function public.admin_suggestion_done(sid bigint, is_done boolean)
returns void language sql volatile security definer set search_path = public as $$
  update public.suggestions set done = is_done where id = sid and public.is_admin();
$$;

revoke all on function public.admin_suggestions() from public, anon;
revoke all on function public.admin_suggestion_done(bigint, boolean) from public, anon;
grant execute on function public.admin_suggestions() to authenticated;
grant execute on function public.admin_suggestion_done(bigint, boolean) to authenticated;
