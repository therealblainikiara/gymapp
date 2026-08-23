-- RLS and RPC assertions for the M2 schema.
--
-- Every test impersonates a real signed-in user the way PostgREST does: it
-- switches to the `authenticated` role and sets the JWT subject claim. A
-- failing assertion aborts the script, so a clean run means every claim below
-- actually holds.
--
--   psql -d gymapp -v ON_ERROR_STOP=1 -f supabase/tests/01_rls.sql
--
-- Run against a scratch database seeded with 00_harness.sql and the migrations
-- (see scripts/db-test.sh). Never run against production: it writes rows.

\set ON_ERROR_STOP on
\timing off
-- Assertions return void; only failures should reach the terminal.
\o /dev/null

begin;

create function assert(cond boolean, msg text) returns void
  language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERTION FAILED: %', msg; end if;
end
$$;

-- Asserts that `sql` fails with insufficient_privilege — which is what both a
-- refused RLS write and a revoked table grant raise.
create function assert_denied(sql text, msg text) returns void
  language plpgsql as $$
begin
  begin
    execute sql;
  exception
    when insufficient_privilege then return;
    when others then
      raise exception 'ASSERTION FAILED: % (expected a permission error, got %: %)',
        msg, sqlstate, sqlerrm;
  end;
  raise exception 'ASSERTION FAILED: % (the statement was allowed)', msg;
end
$$;

-- ── fixtures, written as superuser so RLS does not gate the seed ────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.test');

select assert((select count(*) from gymapp.profiles) = 3,
  'signup trigger: every auth user must get a profile row');

update gymapp.profiles set handle = 'alice', display_name = 'Alice A',
  height_cm = 170, age = 45, injuries = array['knee'], dietary = array['gf']
  where id = '11111111-1111-1111-1111-111111111111';
update gymapp.profiles set handle = 'bob', display_name = 'Bob B'
  where id = '22222222-2222-2222-2222-222222222222';
update gymapp.profiles set handle = 'carol', display_name = 'Carol C'
  where id = '33333333-3333-3333-3333-333333333333';

-- Monday 2026-08-24 sits in the Sunday-start week beginning 2026-08-23.
insert into gymapp.events (user_id, date, type, minutes) values
  ('11111111-1111-1111-1111-111111111111', date '2026-08-24', 'Workout', 30),
  ('22222222-2222-2222-2222-222222222222', date '2026-08-24', 'Walk', 90),
  ('33333333-3333-3333-3333-333333333333', date '2026-08-24', 'Ride', 200);

insert into gymapp.checkins values
  ('22222222-2222-2222-2222-222222222222', date '2026-08-24', 4, 2, 4);

insert into gymapp.challenges (week_start) values (date '2026-08-23');

-- Alice and Bob are friends; Carol is a stranger.
insert into gymapp.friendships (requester, addressee, status) values
  ('11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'accepted');

-- ── act as Alice ────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select assert(auth.uid() = '11111111-1111-1111-1111-111111111111',
  'harness: auth.uid() must resolve the JWT subject');

-- profiles are private
select assert((select count(*) from gymapp.profiles) = 1,
  'profiles: a user must see exactly their own row');
select assert(
  (select count(*) from gymapp.profiles
    where id = '22222222-2222-2222-2222-222222222222') = 0,
  'profiles: another user''s row must be invisible (the draft policy leaked it)');

-- other users' health data is unreachable
select assert((select count(*) from gymapp.events) = 1,
  'events: only own rows are visible');
select assert((select count(*) from gymapp.checkins) = 0,
  'checkins: another user''s check-ins must be invisible');
select assert((select count(*) from gymapp.weights) = 0,
  'weights: another user''s weigh-ins must be invisible');
select assert((select count(*) from gymapp.hydration) = 0,
  'hydration: another user''s rows must be invisible');

-- the leaderboard view honours RLS on events
select assert((select count(*) from gymapp.weekly_active_minutes) = 1,
  'weekly_active_minutes: security_invoker must limit the view to own events');
select assert(
  (select week_start from gymapp.weekly_active_minutes limit 1) = date '2026-08-23',
  'weekly_active_minutes: Monday 2026-08-24 belongs to the Sunday 2026-08-23 week');

-- writes are scoped to the caller
select assert_denied(
  $q$insert into gymapp.events (user_id, date, type, minutes)
     values ('22222222-2222-2222-2222-222222222222', date '2026-08-24', 'Run', 10)$q$,
  'events: writing an event for another user must be refused');

select assert_denied(
  $q$insert into gymapp.challenges (week_start) values (date '2026-08-30')$q$,
  'challenges: server-defined reference data must not be writable by clients');

-- a forged inbound request must be impossible
select assert_denied(
  $q$insert into gymapp.friendships (requester, addressee)
     values ('33333333-3333-3333-3333-333333333333',
             '11111111-1111-1111-1111-111111111111')$q$,
  'friendships: a user must not be able to forge a request from someone else');

-- the requester must not be able to accept their own request
insert into gymapp.friendships (requester, addressee)
  values ('11111111-1111-1111-1111-111111111111',
          '33333333-3333-3333-3333-333333333333');
update gymapp.friendships set status = 'accepted'
  where requester = '11111111-1111-1111-1111-111111111111'
    and addressee = '33333333-3333-3333-3333-333333333333';
select assert(
  (select status from gymapp.friendships
    where requester = '11111111-1111-1111-1111-111111111111'
      and addressee = '33333333-3333-3333-3333-333333333333') = 'pending',
  'friendships: only the addressee may accept — the update must match no row');

-- search returns three columns, opt-in by handle, never yourself
select assert((select count(*) from gymapp.search_profiles('bo')) = 1,
  'search_profiles: must find a profile by handle prefix');
select assert((select count(*) from gymapp.search_profiles('alice')) = 0,
  'search_profiles: must never return the caller');
select assert((select count(*) from gymapp.search_profiles('b')) = 0,
  'search_profiles: a single character must not enumerate the user table');
select assert(
  pg_get_function_result('gymapp.search_profiles(text)'::regprocedure)
    = 'TABLE(id uuid, display_name text, handle text)',
  'search_profiles: the projection must stay at three columns — widening it '
  || 'is how height, age, injuries and dietary requirements leak');
select assert(
  (select display_name from gymapp.search_profiles('bob')) = 'Bob B',
  'search_profiles: must return the display name');

-- the leaderboard sums friends' minutes without exposing their events
select assert(
  (select minutes from gymapp.friend_leaderboard(date '2026-08-23')
    where user_id = '22222222-2222-2222-2222-222222222222') = 90,
  'friend_leaderboard: an accepted friend''s weekly minutes must be visible');
select assert(
  (select count(*) from gymapp.friend_leaderboard(date '2026-08-23')
    where user_id = '33333333-3333-3333-3333-333333333333') = 0,
  'friend_leaderboard: a stranger must not appear');
select assert(
  (select minutes from gymapp.friend_leaderboard(date '2026-08-23')
    where user_id = '11111111-1111-1111-1111-111111111111') = 30,
  'friend_leaderboard: the caller''s own minutes must be included');
select assert((select count(*) from gymapp.events) = 1,
  'friend_leaderboard: reading it must not widen access to raw events');

-- ── act as Bob: the addressee can accept ────────────────────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
update gymapp.friendships set status = 'accepted'
  where requester = '11111111-1111-1111-1111-111111111111'
    and addressee = '22222222-2222-2222-2222-222222222222';
select assert(
  (select status from gymapp.friendships
    where addressee = '22222222-2222-2222-2222-222222222222') = 'accepted',
  'friendships: the addressee must be able to accept');

-- ── act as an anonymous visitor ─────────────────────────────────────────────
reset role;
set local role anon;
set local request.jwt.claims = '';

-- Anon is refused at the grant, before RLS is even consulted. Two independent
-- layers have to fail before a signed-out client sees a row: the table grant
-- and the policy's `to authenticated`.
select assert_denied(
  $q$select count(*) from gymapp.profiles$q$,
  'profiles: an anonymous visitor must not reach the table at all');
select assert_denied(
  $q$select count(*) from gymapp.events$q$,
  'events: an anonymous visitor must not reach the table at all');
select assert_denied(
  $q$select count(*) from gymapp.challenges$q$,
  'challenges: reference data is for signed-in clients only');
select assert_denied(
  $q$select * from gymapp.search_profiles('bob')$q$,
  'search_profiles: must not be executable anonymously');

reset role;
rollback;

\o
\echo 'RLS suite passed.'
