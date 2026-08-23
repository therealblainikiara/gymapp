-- Paste this into the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- and run it. Safe to run more than once — it asserts a state rather than
-- making a change, so re-running it is how you check as well as how you fix.
--
-- WHAT THIS IS FOR
-- Gym App's tables live in the `gymapp` schema, not `public`. PostgREST — the
-- thing behind supabase-js — will not serve a schema it has not been told
-- about. Without this, every Gym App request fails with:
--     PGRST106  the schema must be one of the following: public, graphql_public
--
-- This was already applied on 2026-08-23. Run it again if you ever see that
-- error, which is what happens if the setting gets reset (see the note below).

-- ── 1. Tell PostgREST about the schema ──────────────────────────────────────
alter role authenticator
  set pgrst.db_schemas = 'public, graphql_public, gymapp';

notify pgrst, 'reload config';

-- ── 2. Confirm it took ──────────────────────────────────────────────────────
-- Expect one row containing `pgrst.db_schemas=public, graphql_public, gymapp`.
select unnest(rolconfig) as setting
from pg_roles
where rolname = 'authenticator';

-- ── 3. Confirm the schema is actually there and locked down ─────────────────
-- Expect: tables 8, policies 13, all 13 scoped to `authenticated`,
--         rls_enabled 8, functions 4.
select
  (select count(*) from pg_tables where schemaname = 'gymapp')            as tables,
  (select count(*) from pg_policies where schemaname = 'gymapp')          as policies,
  (select count(*) from pg_policies
     where schemaname = 'gymapp' and roles::text = '{authenticated}')     as scoped_to_authenticated,
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'gymapp' and c.relkind = 'r' and c.relrowsecurity)  as rls_enabled,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'gymapp')                                           as functions;

-- ── IMPORTANT ───────────────────────────────────────────────────────────────
-- Step 1 sets this in the database. Supabase ALSO keeps an "Exposed schemas"
-- setting in the project config (Dashboard → Settings → API), and when that
-- config is next written — by you, or by any dashboard change that touches the
-- API section — it can overwrite what step 1 did, and the app starts throwing
-- PGRST106 out of nowhere.
--
-- So also add `gymapp` in Dashboard → Settings → API → Exposed schemas. With
-- both set, the dashboard write simply re-states what is already true.
