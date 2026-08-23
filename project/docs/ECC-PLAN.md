# ECC-PLAN — Gym App: prototype → real product

Source of truth for scope: `docs/ECC-AUDIT.md`. The prototype (`Gym App v2.dc.html`) is the living spec — every screen, rule and copy decision in it was user-approved.

## Goals (testable)
1. Ship the over-40s planner (workouts/diet/recovery/progress) as a real app with accounts and durable storage.
2. Social layer: real users, partner search, weekly challenges, leaderboards.
3. Device data: Android Health Connect first; iOS HealthKit second.
4. Real media everywhere: exercise images/video, AI coaching.
5. Rigged 3D fitness buddy demonstrating every exercise + recovery move.

## Milestone 1 — Harden the prototype (this workspace)
- C1. Verify image pipeline across all 28 exercises; curate overrides where API results are poor. *Accept: every detail screen shows a relevant image or honest fallback.*
- C2. Verify Claude coach feedback end-to-end incl. rate-limit fallback. *Accept: feedback within 5 s or graceful fallback tip.*
- C3. Personalize kcal/protein targets from height/weight/age (Mifflin-St Jeor) — data already collected. *Accept: targets change when weight/height change.*
- C4. Archive `Gym App.dc.html`, `Home A/B` to an archive folder; keep v2 as sole entry. 
- C5. Legal review pass on disclaimer wording (external counsel — outside agent scope).

## Milestone 2 — Backend + accounts (new codebase; can start in parallel with M1)
> STATUS: handoff complete — see `docs/M2-BACKEND-HANDOFF.md` + `supabase/0001_init.sql`. Implementation requires a real dev environment (outside this workspace).
Stack recommendation: **Supabase** (Postgres + auth + RLS + realtime) with the web app as PWA (React/Next).
- C6. Data model: users, profiles(settings/intake), events, checkins, weights, challenges, challenge_members, friendships. Mirror the prototype's persisted `gymapp_v2` shape for painless migration.
- C7. Auth (email + Google) + disclaimer-acceptance record (timestamped — liability evidence).
- C8. Sync layer: local-first cache, background sync (prototype already local-first).
- C9. Port v2 UI to the app shell 1:1 — the DC file is the design spec; keep Industry tokens.
*Gate: a user can sign up, complete intake, and see their plan on two devices.*

## Milestone 3 — Social (depends on M2)
- C10. Partner search + friend requests (RLS-protected).
- C11. Weekly challenge engine (150 active min, Sunday reset, server-computed) + leaderboards.
- C12. Activity feed of logged events.
*Gate: two real accounts complete a shared challenge.*

## Milestone 4 — Devices (Android first; parallel with M3)
- C13. Android wrapper (Capacitor or native) + Health Connect read: steps, HR, sleep, exercise sessions → auto-import as events.
- C14. Smart scale weight import via Health Connect.
- C15. iOS HealthKit parity (parallel team once C13 patterns settle).
*Gate: a walk recorded on a watch appears as an event and counts toward the challenge.*

## Milestone 5 — Buddy + media
- C16. Rigged three.js Mii-style buddy with animation clips per movement pattern (squat/hinge/press/pull/carry/stretch/breath); replaces CSS figure. Can run parallel to M2-4 (isolated component).
- C17. Real demo videos per exercise (licensed or shot) replacing API images where available.
- C18. Camera form analysis: on-device pose model (MediaPipe) for real rep counting; Claude feedback fed real joint angles.

## Concurrency map
- Parallel-safe: M1 (prototype) ∥ C6-C8 (backend) ∥ C16 (buddy component).
- Collisions: C9 depends on C6 schema; C11 and C13 both write `events` (agree schema in C6 first); C18 touches camera screen also modified by C16 demos — sequence C16 → C18.

## Not in scope until decided
- Vegan/pescatarian tiers, meal-photo logging, wearables beyond Health Connect/HealthKit, coach marketplace.
