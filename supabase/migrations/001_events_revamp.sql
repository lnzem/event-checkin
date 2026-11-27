-- ============================================================
-- 001_events_revamp.sql
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  organization text,
  contact_number text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Backfill profiles for any existing auth users
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- Auto-create a profile for every new auth user. Role is ALWAYS 'user'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- is_admin(): used by every admin RLS policy and RPC
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Users may edit ONLY these columns. Nobody can change `role` from the client.
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, organization, contact_number) on public.profiles to authenticated;

-- ---------- events ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  venue text not null default '' check (char_length(venue) <= 150),
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer check (capacity >= 1),
  cover_image_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order check (ends_at is null or starts_at is null or ends_at > starts_at),
  -- Drafts may be incomplete; published/cancelled events must be complete.
  constraint events_complete_unless_draft check (
    status = 'draft'
    or (starts_at is not null and ends_at is not null and capacity is not null and venue <> '')
  )
);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create index if not exists events_status_starts_idx on public.events (status, starts_at);

alter table public.events enable row level security;
revoke all on public.events from anon;
grant select, insert, update, delete on public.events to authenticated;

drop policy if exists events_admin_all on public.events;
create policy events_admin_all on public.events
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- registrations: add event_id + user_id ----------
alter table public.registrations
  add column if not exists event_id uuid references public.events(id) on delete restrict,
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Normalize emails so the new unique rule is case-insensitive
update public.registrations set email = lower(trim(email));

-- Move all existing registrations under one hidden legacy event
do $$
declare
  legacy_id uuid;
  reg_count integer;
begin
  select count(*) into reg_count from public.registrations where event_id is null;
  if reg_count > 0 then
    insert into public.events (title, description, venue, starts_at, ends_at, capacity, status)
    values (
      'Legacy event (imported)',
      'Registrations created before events were introduced.',
      'TBD',
      (select coalesce(min(created_at), now()) from public.registrations),
      (select coalesce(max(created_at), now()) from public.registrations) + interval '1 day',
      greatest(reg_count, 1),
      'draft'   -- hidden from the public; publish it from the admin dashboard if you want it visible
    )
    returning id into legacy_id;

    update public.registrations set event_id = legacy_id where event_id is null;
  end if;
end $$;

alter table public.registrations alter column event_id set not null;

-- Drop the OLD "unique email" constraint (whatever it is named)
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.registrations'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text)
        from pg_attribute a
        where a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      ) = array['email']
  loop
    execute format('alter table public.registrations drop constraint %I', r.conname);
  end loop;
end $$;
-- If a plain unique INDEX on email also exists, drop it manually. List them with:
--   select indexname, indexdef from pg_indexes where tablename = 'registrations';

-- New rules: one registration per email per event; ticket ids stay globally unique
create unique index if not exists registrations_event_email_key
  on public.registrations (event_id, lower(email));
create unique index if not exists registrations_ticket_id_key
  on public.registrations (ticket_id);
create index if not exists registrations_event_id_idx on public.registrations (event_id);
create index if not exists registrations_user_id_idx on public.registrations (user_id);

-- ---------- registrations RLS ----------
alter table public.registrations enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'registrations'
  loop
    execute format('drop policy %I on public.registrations', p.policyname);
  end loop;
end $$;

revoke all on public.registrations from anon;

-- Logged-in users read only their own tickets
create policy registrations_select_own on public.registrations
  for select to authenticated
  using (user_id = auth.uid());

-- Admins read everything
create policy registrations_select_admin on public.registrations
  for select to authenticated
  using (public.is_admin());

-- No insert/update/delete policies on purpose: all writes go through the API
-- using the service role (register, check-in, undo check-in).

-- ---------- public view of events (no personal data) ----------
drop view if exists public.events_public;
create view public.events_public with (security_barrier = true) as
select
  e.id, e.title, e.description, e.venue, e.starts_at, e.ends_at,
  e.capacity, e.cover_image_url, e.status,
  (select count(*)::int from public.registrations r where r.event_id = e.id) as registered_count
from public.events e
where e.status in ('published', 'cancelled');

grant select on public.events_public to anon, authenticated;
-- This view intentionally runs with the owner's rights so anonymous visitors can see
-- the aggregate registered_count without any access to the registrations table.

-- ---------- atomic registration (called ONLY by the API with the service role) ----------
create or replace function public.register_for_event(
  p_event_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_organization text,
  p_contact_number text,
  p_ticket_id text
) returns public.registrations
language plpgsql security definer set search_path = public as $$
declare
  ev public.events;
  cnt integer;
  reg public.registrations;
begin
  select * into ev from public.events where id = p_event_id for update;   -- serializes concurrent signups
  if not found or ev.status = 'draft' then
    raise exception 'event_not_found';
  end if;
  if ev.status = 'cancelled' or now() > ev.ends_at then
    raise exception 'event_closed';
  end if;

  select count(*) into cnt from public.registrations where event_id = p_event_id;
  if cnt >= ev.capacity then
    raise exception 'event_full';
  end if;

  begin
    insert into public.registrations
      (event_id, user_id, ticket_id, full_name, email, organization, contact_number, qr_sent, checked_in)
    values
      (p_event_id, p_user_id, p_ticket_id, p_full_name, lower(trim(p_email)), p_organization, p_contact_number, false, false)
    returning * into reg;
  exception when unique_violation then
    if exists (select 1 from public.registrations
               where event_id = p_event_id and lower(email) = lower(trim(p_email))) then
      raise exception 'duplicate_registration';
    else
      raise exception 'ticket_collision';
    end if;
  end;

  return reg;
end $$;

revoke all on function public.register_for_event(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, uuid, text, text, text, text, text)
  to service_role;

-- ---------- claim guest tickets after a verified login ----------
create or replace function public.claim_my_registrations()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare
  u_email text;
  confirmed timestamptz;
  n integer;
begin
  if auth.uid() is null then return 0; end if;
  select email, email_confirmed_at into u_email, confirmed from auth.users where id = auth.uid();
  if u_email is null or confirmed is null then return 0; end if;   -- only VERIFIED emails can claim

  update public.registrations
     set user_id = auth.uid()
   where user_id is null and lower(email) = lower(u_email);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.claim_my_registrations() from public, anon;
grant execute on function public.claim_my_registrations() to authenticated;

-- ---------- admin dashboard stats ----------
create or replace function public.admin_event_stats()
returns table (event_id uuid, registered_count integer, checked_in_count integer)
language sql stable security definer set search_path = public as $$
  select e.id,
         count(r.id)::int,
         (count(r.id) filter (where r.checked_in))::int
  from public.events e
  left join public.registrations r on r.event_id = e.id
  where public.is_admin()
  group by e.id;
$$;

create or replace function public.admin_checked_in_today()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.registrations
  where public.is_admin()
    and checked_in
    and (checked_in_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date;
$$;

revoke all on function public.admin_event_stats() from public, anon;
revoke all on function public.admin_checked_in_today() from public, anon;
grant execute on function public.admin_event_stats() to authenticated;
grant execute on function public.admin_checked_in_today() to authenticated;

-- ---------- storage bucket for event cover images ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists event_covers_public_read on storage.objects;
create policy event_covers_public_read on storage.objects
  for select using (bucket_id = 'event-covers');

drop policy if exists event_covers_admin_insert on storage.objects;
create policy event_covers_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-covers' and public.is_admin());

drop policy if exists event_covers_admin_update on storage.objects;
create policy event_covers_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'event-covers' and public.is_admin())
  with check (bucket_id = 'event-covers' and public.is_admin());

drop policy if exists event_covers_admin_delete on storage.objects;
create policy event_covers_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-covers' and public.is_admin());

-- ---------- realtime (admin attendee list / scanner counters) ----------
-- Realtime respects RLS, so only admins receive row changes.
do $$
begin
  alter publication supabase_realtime add table public.registrations;
exception when duplicate_object then null;
end $$;
