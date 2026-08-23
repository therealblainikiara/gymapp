# M2 — Implementation notes

What was built for chunks C6–C9 of `project/docs/ECC-PLAN.md`, against
`project/docs/M2-BACKEND-HANDOFF.md`. Read
[M2-SETUP.md](./M2-SETUP.md) first if you just want it running.

## Layout

```
supabase/
  migrations/…_gymapp_init.sql         C6 — the `gymapp` schema, RLS, RPCs
  migrations/…_scope_policies_…sql     policies scoped to `authenticated`
  tests/00_harness.sql                 stand-in auth schema for local runs
  tests/01_rls.sql                     policy assertions
scripts/
  db-push.sh                           apply migrations to a real project
  db-test.sh                           apply + assert against scratch Postgres
web/
  src/proxy.ts                         C7 — the gate (Next 16's "middleware")
  src/app/sign-in|auth|disclaimer|intake      C7
  src/app/(app)/…                      C9 — the seven screens + /live
  src/app/api/coach                    AI coach proxy
  src/lib/domain/                      logic ported from the prototype
  src/lib/local/                       C8 — IndexedDB cache + store
  src/lib/sync/                        C8 — outbox, push, pull, legacy import
```

## Stack decisions

**Next.js App Router** over Vite. The handoff offered either but then required
middleware that blocks app routes and a server route holding the Anthropic key;
both are native here and would need a separate service under Vite.

**Next 16 renamed `middleware.ts` to `proxy.ts`.** Same feature, and `next
build` warns on the old name. `src/proxy.ts` is the file the handoff calls
middleware.

## C7 — the gate

`getUser()`, not `getSession()`: only the former verifies the JWT against the
auth server, and a gate that trusts an unverified cookie is not a gate.

Order per request: no session → `/sign-in?next=…`; disclaimer not current →
`/disclaimer`; intake not finished → `/intake`. API routes get JSON 401/403
instead of a redirect, because a `fetch()` follows redirects silently and would
receive an HTML sign-in page where it expected JSON.

`DISCLAIMER_VERSION` in `lib/disclaimer.ts` is compared against the stored
value, so bumping it re-gates everyone. Acceptance is written straight to
Postgres, not through the outbox — everything else in this app is local-first
and this one thing must not be. The gate reads it server-side, and an
acceptance sitting in an outbox on a phone that never reconnects is not
evidence of anything.

The wizard writes all its answers plus `intake_completed_at` in one update at
"Build my plan", so an abandoned wizard leaves the gate closed rather than
producing a half-configured plan.

## C8 — sync

The UI reads only from IndexedDB. One database per user (`gymapp:<uid>`), so
two accounts on a shared browser cannot see each other's cache and signing out
is one `deleteDatabase`.

Every mutation writes the cache, appends `{table, op, key, payload,
client_ts}`, notifies subscribers and schedules a flush. Flushes also run on
`online`, on tab focus, and on a 30 s timer; a full pull runs every 5 minutes.

**Coalescing.** Eight taps of "+250 ml" offline become one write carrying the
final total. Profile patches merge field-by-field. A delete supersedes
everything queued before it for that row. Ordering between different rows
follows each group's last write.

**Conflicts.**

- *profiles* — last-write-wins by `updated_at`, as specified. Two refinements:
  the patch carries only the fields that changed, so two devices editing
  different settings both win; and the update is guarded with
  `.lte("updated_at", client_ts)`, so a patch that left device A before device
  B's newer write matches no row and is dropped instead of clobbering it. When
  that happens the client re-pulls, so the user sees the value that stuck
  rather than their stale one.
- *events, checkins, weights, hydration* — natural primary keys make upserts
  idempotent, so a retry after a timeout cannot double-log a session.

The push stops at the first failure so later writes cannot overtake an earlier
one, and records `attempts` and `last_error` on the queued op — a poison
message is visible in Setup rather than retried invisibly forever.

**Pull merge.** A row with an unflushed local write keeps the local value;
every other row takes the server's. Combined with the LWW guard, the pair
converges without either side discarding input.

**Legacy import.** On first sign-in, `gymapp_v2` is read from localStorage,
validated, and queued. The original blob is left in place — a bad import is
recoverable while it still exists.

Validation is not defensive padding. Every constraint in the migration is a
write the client can attempt, and one rejected row would stall the whole
outbox behind it, so the importer clamps what it can and counts what it drops
(shown in Setup). `accepted` and `onboardDone` are deliberately *not* imported:
a boolean in a browser is not evidence that a person accepted a specific
version of the terms, so migrated users accept once more against their account.

## C9 — the port

All seven screens plus the exercise detail and live camera. Logic ported from
the prototype's `renderVals`: the plan generator including its budget table and
day-rotation arithmetic, Mifflin-St Jeor targets, meal filtering, the streak
rule, the buddy animation picker, and the Commons media pipeline with its mime
check, stopword-stripped keyword filter and junk-domain blocklist.

Design comes from the Industry token sheet, copied verbatim to
`web/src/app/industry.css`. No hex, font or spacing value is hard-coded past
the tokens.

### Deliberate differences from the prototype

| Change | Why |
|---|---|
| Derived counters | `sessions` and `activity` were stored alongside the events that produced them. Deriving both from `events` and `checkins` removes two things to keep in step across devices. |
| "Count today's walk" logs a 25-minute Walk | It called `logSession`, which logged a *Workout* of the user's session length — on a card headed "Rest-day walk — 25 min". |
| Non-compliant meal fallback is labelled | Where no meal in a slot satisfies every dietary requirement, the prototype silently showed a non-compliant one. It is now shown with a warning. For a nut allergy, a quietly non-compliant meal card is the worst failure this app has. |
| Rep counter and HR read "SIMULATED" | They said "AUTO" and "WATCH". Both are timer-driven. |
| Real user search and leaderboard | The prototype's honest "needs a backend" row; the backend now exists. |
| `toggleFriend` implemented | It was a no-op in the prototype. |
| Device key `hrm` → `ios` | Finishes the rename the audit flagged; the importer maps the old flag across. |
| Screens are routes | `/home`, `/train/[slug]`, `/live` etc. rather than nav state, so the gate can act on them and links are shareable. |

Unchanged on purpose: the disclaimer wording (pending legal review — C5), all
exercise cues and safety notes, the meal library, and the CSS fitness buddy
(the rigged three.js character is C16).

## AI coach

`POST /api/coach` — signed-in only, all fields bounded before they reach the
model, 9-second race with a fallback to a built-in cue, `claude-haiku-4-5` as
the handoff specifies. It sits behind a `CoachProvider` interface because the
provider is explicitly an open decision: a project-wide key (what this does), a
bring-your-own-key flow, or a different model are each one more implementation
of that interface and no change to the route or the UI.

## Verification

Run against real software in this session:

- **115 unit tests** (`cd web && npm run test`) — plan generation and injury
  filtering across every goal × kit × length × injury combination; dietary
  filtering across all 16 requirement combinations; Mifflin-St Jeor and the
  BMI copy rules; streak and Sunday-week arithmetic; outbox coalescing; the
  legacy importer against a deliberately corrupt blob; the media filters
  including the specific junk collisions that took four rounds to fix in M1.
- **RLS suite** (`./scripts/db-test.sh`) against Postgres 16 — asserts a user
  cannot read another profile, another user's events or check-ins; that
  `search_profiles` stays at three columns, excludes the caller and refuses
  one-character queries; that a friend request cannot be forged and only the
  addressee can accept; that `friend_leaderboard` shows a friend's total but
  not a stranger's, and does not widen access to raw events; that
  `challenges` is not client-writable; and that an anonymous visitor sees
  nothing.
- **Typecheck, lint, production build** — all clean.
- **HTTP smoke test** against `next start` — `/` and `/home` redirect to
  `/sign-in` preserving `next`; `/sign-in` is server-rendered; `/api/coach`
  answers `401 {"error":"unauthenticated"}`; the manifest and icon serve.

Run against the hosted project `ytyaouylcbathwyodpvi` (Postgres 17.6), through
the Supabase MCP connector:

- **Both migrations applied.** Eight tables in `gymapp`, 13 policies, RLS on
  all eight, four functions, and `weekly_active_minutes` carrying
  `security_invoker=true`. `public.profiles` — the squash app's venue settings
  — still has its original 19 columns and was not touched.
- **Policies enforce on the live database.** Impersonating a signed-in user
  (`set local role authenticated` + a JWT subject claim) returns zero rows from
  every table; `search_profiles` still reports exactly
  `TABLE(id uuid, display_name text, handle text)`; `authenticated` is refused
  when writing `challenges`; `anon` is refused on every table and on the search
  RPC.
- **Types match reality.** Every column name and nullability in `gymapp` was
  compared against `src/lib/types/database.ts` — exact match across all eight
  tables and the view.

**Still not verified — this container's network policy blocks `*.supabase.co`,
so nothing has reached the project over HTTP:**

- No magic link or Google sign-in has been exercised end to end, and the
  redirect URLs are not configured yet.
- PostgREST's view of the `gymapp` schema. The exposed-schemas setting was
  applied as a role GUC with a config reload, but it could not be confirmed
  with a REST call from here. If the first request returns `PGRST106`, set
  *Exposed schemas* in the dashboard — see M2-SETUP.md step 3a.
- The coach route has not called Anthropic (no key configured here).
- **The milestone gate has not been run.** Script below.

## The milestone gate

> A user signs up on two devices, accepts the disclaimer once, completes
> intake, logs a workout on device A and sees plan + streak + event on device B
> after sync.

1. Device A: open the app, sign in by magic link. Expect the disclaimer.
2. Accept. Expect the intake wizard. Complete it. Expect Home.
3. Device B (a different browser profile, or a phone): sign in as the same
   user. Expect Home directly — **no second disclaimer**. This is the "accepts
   the disclaimer once" half of the gate, and it works because acceptance is
   on the account, not the device.
4. Device A: Train → "Mark session done". Home's streak goes to 1.
5. Device B: reload, or just switch to the tab — focus triggers a sync. Expect
   the same plan, streak 1, and the session under Social → Recent activities.
6. Offline check: put device A in aeroplane mode, log a walk, tap "+250 ml"
   several times. The header shows `OFFLINE · n`. Reconnect; the badge clears
   and device B sees one hydration total, not one row per tap.

## Not in this milestone

Device imports (M4 — the schema already carries `source`/`external_id`), the
rigged 3D buddy (C16), a curated video library (C17), pose-based rep counting
(C18), and the Sunday cron that seeds `challenges` (C11 — the client falls back
to the current week's Sunday and the same 150-minute target).

Legal review of the disclaimer (C5) remains open and is not something this
milestone could close.
