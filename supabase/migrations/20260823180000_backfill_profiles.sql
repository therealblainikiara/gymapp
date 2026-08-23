-- Backfill gymapp.profiles for auth users that predate the signup trigger.
--
-- THE BUG THIS FIXES
-- `handle_new_user()` fires `after insert on auth.users`, so it only covers
-- accounts created after 20260823000100. This project already had accounts, and
-- they ended up with no gymapp.profiles row at all. What that does to them:
--
--   1. The proxy reads gymapp.profiles → no row → disclaimer not accepted
--   2. Redirect to /disclaimer
--   3. Accept runs `update gymapp.profiles ... where id = auth.uid()`
--      → matches ZERO rows. PostgREST does not treat that as an error, so the
--        client sees success and navigates on
--   4. The proxy re-checks → still no row → back to /disclaimer
--
-- An infinite redirect loop, with no error message anywhere, and the user can
-- never reach the app. It is silent precisely because a zero-row UPDATE is not
-- a failure.
--
-- The client side is also hardened (the disclaimer and intake writes now
-- upsert rather than update), so a missing row self-heals instead of looping.
-- This migration closes the gap for the accounts that already exist; the
-- upserts close it for any future path that creates a user without the trigger
-- — the admin API, a database restore, or the trigger being dropped.

insert into gymapp.profiles (id, display_name)
select
  u.id,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(u.email, '@', 1)
  )
from auth.users u
where not exists (
  select 1 from gymapp.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- Deliberately does NOT set disclaimer_accepted_at or intake_completed_at.
-- Backfilled users get a profile row to write into, then see the disclaimer and
-- the intake wizard exactly as a new user would. Pre-accepting on their behalf
-- would forge the liability record this column exists to be.
