-- Scope every Gym App policy to the `authenticated` role.
--
-- The policies in 20260823000100_gymapp_init.sql were created without a `to`
-- clause, which defaults to the `public` role — meaning they are also evaluated
-- for `anon`. That is safe as written, because `auth.uid()` is null for an
-- anonymous request and every predicate compares against it, so anon matches no
-- rows. It was verified against the live database before this migration.
--
-- It is still worth fixing, for two reasons. Supabase's database linter flags
-- it on all eight tables (`auth_allow_anonymous_sign_ins`), and eight standing
-- warnings are how a real one gets missed. And the safety is incidental rather
-- than declared: it depends on every current and future policy predicate
-- happening to dereference auth.uid(). Saying `to authenticated` states the
-- intent instead of relying on it.
--
-- Note this does not by itself keep out Supabase *anonymous sign-ins*, which
-- issue a real JWT under the same `authenticated` role with `is_anonymous` set.
-- That feature is off for this project; if it is ever enabled, these policies
-- need an explicit `auth.jwt() ->> 'is_anonymous' = 'false'` check as well.

-- profiles
drop policy "own profile read" on gymapp.profiles;
drop policy "own profile insert" on gymapp.profiles;
drop policy "own profile update" on gymapp.profiles;

create policy "own profile read" on gymapp.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "own profile insert" on gymapp.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile update" on gymapp.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- owner-scoped tables
drop policy "own events" on gymapp.events;
create policy "own events" on gymapp.events
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy "own checkins" on gymapp.checkins;
create policy "own checkins" on gymapp.checkins
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy "own weights" on gymapp.weights;
create policy "own weights" on gymapp.weights
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy "own hydration" on gymapp.hydration;
create policy "own hydration" on gymapp.hydration
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy "own membership" on gymapp.challenge_members;
create policy "own membership" on gymapp.challenge_members
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- friendships: still split per command so a request cannot be forged by the
-- addressee or accepted by the requester.
drop policy "friendship read" on gymapp.friendships;
drop policy "friendship request" on gymapp.friendships;
drop policy "friendship respond" on gymapp.friendships;
drop policy "friendship withdraw" on gymapp.friendships;

create policy "friendship read" on gymapp.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester, addressee));
create policy "friendship request" on gymapp.friendships
  for insert to authenticated
  with check ((select auth.uid()) = requester and status = 'pending');
create policy "friendship respond" on gymapp.friendships
  for update to authenticated using ((select auth.uid()) = addressee)
  with check ((select auth.uid()) = addressee);
create policy "friendship withdraw" on gymapp.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));

-- `challenges` was already scoped to authenticated. Its table grant was not:
-- anon could read the reference data. Nothing sensitive is in it, but there is
-- no reason for a signed-out client to see it either.
revoke select on gymapp.challenges from anon;
revoke select on gymapp.weekly_active_minutes from anon;
revoke select, insert, update, delete on
  gymapp.profiles, gymapp.events, gymapp.checkins, gymapp.weights,
  gymapp.hydration, gymapp.friendships, gymapp.challenge_members
  from anon;

alter default privileges in schema gymapp
  revoke select, insert, update, delete on tables from anon;
