# M2 — Schema changelog

The migrations in `supabase/migrations/` are derived from the draft at
`project/supabase/0001_init.sql`. Everything below is a deliberate difference,
with the reason. Nothing was changed for style.

## Placement: the `gymapp` schema

The draft creates its tables in `public`. The target project's `public` schema
turned out to be shared by three unrelated apps — a squash competition system,
a songwriting tool, and one more — across 40 tables, and it already has a
`public.profiles`: not a user profile, but squash venue settings
(`voice_referee`, `court_trace`, `booking_api_key`). `create table
public.profiles` would simply have failed.

Renaming that one table would have unblocked the migration, but Gym App also
wants `events`, `weights` and `challenges`, which are generic enough to collide
with whatever those apps add next. So everything moved to a `gymapp` schema.
Two migrations cannot now reach each other's tables, and neither can a
mistaken `delete from events`.

The costs, both one-time: `gymapp` has to be in the project's PostgREST exposed
schemas, and the Supabase clients pass `db: { schema: "gymapp" }`. Because
Supabase's default privileges only cover `public`, the migration also issues
its own `grant usage` and table grants — RLS is still what decides rows; the
grants only decide whether PostgREST can see the table at all.

`auth.users` is shared with the other apps, by agreement. The signup trigger is
named `on_auth_user_created_gymapp` so it cannot be confused with another app's,
and it fires for every signup in the project — one empty row per account, and
one login works across apps.

## Security

### The profiles select policy — the important one

The draft had:

```sql
create policy "public handle search" on profiles for select using (true);
-- expose only via a security-definer RPC returning (id, display_name, handle)
```

The comment describes the intent, but the policy does not implement it. RLS is
row-level, not column-level: `using (true)` on `profiles` means any signed-in
user can `select *` and read every other user's height, age, sex, injuries and
dietary requirements. For an app whose whole premise is that dietary flags are
*health requirements*, that is the most sensitive table in the schema.

Now: `profiles` is readable only by its owner, and discovery goes through
`search_profiles(q)` — `security definer`, `set search_path = ''`, returning
exactly `(id, display_name, handle)`. The RLS suite asserts both halves,
including that the function's return type stays at three columns.

### challenges had no RLS at all

`alter table ... enable row level security` was applied to seven tables but not
`challenges`. PostgREST exposes the table regardless, so any client could
insert or rewrite challenge rows — including the target they are being measured
against. Now: RLS on, `select` for authenticated, and `insert/update/delete`
revoked from `anon` and `authenticated`. The weekly seeding job (C11) writes it
with the secret key.

### weekly_active_minutes runs as the invoker

Postgres views default to running with the definer's privileges, which would
have made the view a way around RLS on `events`. `security_invoker = true`
means the view shows you your own minutes and nothing else. Friends' totals
come from `friend_leaderboard()`, which is the one audited widening — it
returns a sum per person, never the underlying events.

### friendships policies split by command

The draft's `for all using (auth.uid() in (requester, addressee))` lets either
party do anything, which means user A can insert a row claiming user B
requested them, and can then accept it on B's behalf. Split into four:

| Command | Who |
|---|---|
| select | either party |
| insert | the requester only, and only with `status = 'pending'` |
| update | the addressee only |
| delete | either party |

### Function hardening

Both RPCs and both triggers set `search_path = ''` and are fully schema
qualified — a `security definer` function without that is the classic
search-path privilege-escalation vector. Execute is revoked from `public` and
`anon`, granted to `authenticated`.

## Correctness

### Client-generated event ids

The draft's `unique (user_id, source, external_id)` is described as a dedupe
key. It cannot protect manual entries: their `external_id` is null, and NULLs
are distinct from each other in a unique index, so ten retries of one write
insert ten rows. The client now generates the `id` and the outbox upserts on
the primary key, which makes a retried flush idempotent. The dedupe key is kept
as-is for the device imports it was designed for (M4).

### Value constraints

The draft constrained scalars but not the arrays or the columns the client
writes freely. Added: element checks on `muscles`, `dietary`, `injuries` and
`avail_days`; `array_length(mobility) = 5`; a `type` check on `events`; ranges
on `minutes`, `avg_hr`, `distance_km`, `ml`, `height_cm` and `age`; a
`source` check on `weights`; a positive `target` on `challenges`; and
`extract(dow from week_start) = 0` so a challenge row cannot be seeded on a day
that is not a Sunday.

These matter more than they look. Every one of them is a write the client can
attempt, and a rejected write stalls the outbox behind it — so the client-side
validators in `lib/sync/legacy.ts` and the store are written against exactly
this list. Change a constraint here and change them together.

### disclaimer_pair

`check ((disclaimer_accepted_at is null) = (disclaimer_version is null))`. A
timestamp without a version — or the reverse — is not usable as evidence of
what a person accepted, which is the entire reason the column exists.

## Additions

| Addition | Why |
|---|---|
| `profiles.intake_completed_at` | The gate needs to distinguish "accepted the disclaimer" from "finished the wizard". The draft had nowhere to record the second. |
| `handle_new_user()` trigger on `auth.users` | Every account gets a profile row at signup, so the disclaimer write has a row to target and no client has to branch on "profile does not exist yet". |
| `touch_updated_at()` trigger | Last-write-wins needs `updated_at` to actually move on every update. |
| `search_profiles(q)` | Named in the handoff, not present in the draft. Minimum two characters and handle-only discoverability, so it cannot be used to enumerate the user table. |
| `friend_leaderboard(week_start)` | Server-computed totals for friends and challenge members. The handoff is explicit: "Server-computed; never trust client totals." |
| `handle` format check + `events_user_date_idx` + `friendships_addressee_idx` | A unique text column with no shape, and the two lookups every screen makes. |

## Second migration — `20260823001000_scope_policies_to_authenticated.sql`

Applied after the first, in response to Supabase's own database linter flagging
`auth_allow_anonymous_sign_ins` on all eight tables.

The original policies were created without a `to` clause, which defaults to the
`public` role and therefore also evaluates them for `anon`. That was safe —
every predicate compares against `auth.uid()`, which is null for an anonymous
request, so anon matched no rows, and that was verified against the live
database before changing anything. But the safety was incidental rather than
declared: it held only because every predicate happened to dereference
`auth.uid()`, and a future policy that did not would have quietly opened the
table.

Now every policy says `to authenticated`, and anon's table grants are revoked
outright — so a signed-out client is refused at the grant, before RLS is even
consulted. Two independent layers, and eight fewer standing warnings on the
project's security page.

One thing this does *not* do: Supabase's anonymous sign-ins issue a real JWT
under the same `authenticated` role, with `is_anonymous` in the claims. That
feature is off for this project. If it is ever turned on, these policies need
an explicit `auth.jwt() ->> 'is_anonymous' = 'false'` check as well — noted in
the migration itself.

## Unchanged

Table and column names, types, defaults and the Sunday-week arithmetic
(`date_trunc('week', date + 1) - 1`) are exactly as drafted — the local shape
mirrors the prototype's `gymapp_v2` blob so the migration stays a straight
upload.
