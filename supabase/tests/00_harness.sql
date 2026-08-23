-- Minimal stand-in for the parts of a Supabase project the migrations depend
-- on: the `auth` schema, `auth.uid()`, and the anon/authenticated/service_role
-- roles with the grants Supabase gives them. Applying this to a bare Postgres
-- lets the migrations and the RLS tests run without a hosted project.
--
-- This file is for local verification only. Never apply it to a real project —
-- Supabase already provides all of it.

create schema if not exists auth;

-- Supabase installs extensions here rather than in public.
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Supabase reads the subject out of the request JWT. Locally we read the same
-- GUC the real implementation does, so tests can impersonate a user with
-- `set local request.jwt.claims`.
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants the API roles usage on `auth` and execute on auth.uid(),
-- which every RLS policy calls. Without this the policies error instead of
-- filtering.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- Supabase's default privileges: broad table grants, with RLS as the actual
-- gate. Reproducing them here is what makes the RLS tests meaningful.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
