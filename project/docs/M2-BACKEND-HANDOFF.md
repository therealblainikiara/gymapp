# M2 — Backend & Accounts: Developer Handoff

Scope: chunks C6–C9 of `docs/ECC-PLAN.md`. The design spec is `Gym App v2.dc.html` — port it 1:1 (Industry design tokens in `_ds/industry-*/styles.css`). Schema: `supabase/0001_init.sql`.

## Stack
- **Supabase**: Postgres + Auth + RLS + Realtime. One project per env (dev/prod).
- **Client**: React (Next.js or Vite) PWA. Keep the prototype's screen structure: Home / Train / Diet / Recover / Social / Progress / Setup + disclaimer gate + 7-step intake wizard + camera live mode.
- **AI coaching**: server route proxying Anthropic Messages API (haiku), same prompt as prototype (`toggleSet` in the DC logic) — never ship the API key to the client.

## C7 — Auth & disclaimer
- Email magic-link + Google OAuth.
- After first sign-in: disclaimer screen (verbatim text from the prototype, pending legal review). Accept writes `profiles.disclaimer_accepted_at` + `disclaimer_version`. **Middleware blocks all app routes until it is set.** Bumping the version re-gates everyone.
- Intake wizard runs next; writes `profiles` fields; `redo` re-opens it (same as prototype Settings).

## C8 — Sync (local-first)
- Client keeps the prototype's local shape (`gymapp_v2`) in IndexedDB as the write-through cache; UI always reads local.
- Outbox queue: every mutation appends `{table, op, payload, client_ts}`; a sync worker flushes when online. Conflict rule: **last-write-wins by `updated_at`** for profile/settings; events/checkins/weights are append-only keyed rows (natural PKs prevent dupes; device imports dedupe on `(user_id, source, external_id)`).
- First-run migration: if a legacy `gymapp_v2` localStorage blob exists, upload it (settings→profiles, events, checkins, weights, hydration) then mark migrated.

## C9 — Port map (screen → data)
| Screen | Reads | Writes |
|---|---|---|
| Home | profiles, checkins(today, last7), events(week), hydration(today) | checkins, hydration |
| Train | plan derived client-side from profiles (same generator as DC logic — port `renderVals` plan block verbatim) | events (log session) |
| Exercise detail | Commons media pipeline (port `loadExMedia` incl. mime check, keyword + junk filters, MEDIA_TERMS) | — |
| Camera | getUserMedia/MediaRecorder (unchanged); coach feedback via server AI route | events |
| Diet | profiles.dietary (hard filters — never soften), Mifflin-St Jeor targets (port formula) | — |
| Social | weekly_active_minutes view, friendships, challenges | events, friendships, challenge_members |
| Progress | weights, checkins, events, profiles(height/age/sex/mobility) | weights, profiles |
| Setup | profiles | profiles |

## Social specifics (C10–C11 preview, build after gate)
- User search via security-definer RPC `search_profiles(q)` returning only (id, display_name, handle) — RLS keeps everything else private.
- Weekly challenge: a cron (Supabase scheduled function) inserts next week's `challenges` row each Sunday 00:00 UTC-user-local-agnostic (store week_start date; client displays in local time). Leaderboard = `weekly_active_minutes` joined to accepted friends + challenge members. Server-computed; never trust client totals.

## Milestone gate
A user signs up on two devices, accepts the disclaimer once, completes intake, logs a workout on device A and sees plan + streak + event on device B after sync.

## Not in this milestone
Device imports (M4 — schema already carries `source`/`external_id`), rigged 3D buddy (C16), real video library (C17), pose-based rep counting (C18).
