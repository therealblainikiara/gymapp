# ECC-PLAN — Gym App: prototype → real product

Source of truth for scope. Evidence behind every claim here is in
`docs/ECC-AUDIT.md`.

Supersedes `project/docs/ECC-PLAN.md`, which is kept unmodified as part of the
Claude Design export bundle. The prototype (`project/Gym App v2.dc.html`)
remains the living design spec — every screen, rule and copy decision in it was
user-approved.

## Goals (testable)

1. Ship the over-40s planner — **workouts, diet, recovery and progress as four
   peers** — as a real app with accounts and durable storage.
2. Social layer: real users, partner search, weekly challenges, leaderboards.
3. Device data: Android Health Connect first; iOS HealthKit second.
4. Real media everywhere: exercise images/video, AI coaching.
5. Rigged 3D fitness buddy demonstrating every exercise **and every recovery
   movement**.
6. Age- and condition-aware programming, starting with the 45–55 band.

Goal 1's emphasis is new in this revision and is what Milestone 7 exists to
honour. See `docs/ECC-AUDIT.md` §2 C-4.

---

## Status

| Milestone | State |
|---|---|
| M1 Harden the prototype | C3, C4 done · C1 at 70% · C2 at 85% · C5 external |
| M2 Backend + accounts | **Done** — C6–C9, live on `gymapp-two-phi.vercel.app` |
| M3 Social | C10 80% · C11 40% · C12 70% |
| M4 Devices | Simulated, disclosed in-app |
| M5 Buddy + media | C16 10% · C17 30% · C18 15% |
| M6 Condition-aware | **C19, C20 done** · C21–C26 open |
| M7 Recovery parity | **New. Next.** |

---

## Milestone 7 — Recovery as a first-class surface

**Why it is next and not later.** C20 shipped an exhaustively tested guarantee
that no workout plan reaches a user with declared osteoporosis containing loaded
spinal flexion or end-range rotation. The Recovery screen currently serves that
same user Child's pose, a supine twist and a standing hamstring reach, and the
Progress screen sets "touch toes" as an achievement to tick off. A filter that
covers one screen and not its neighbour is worse than no filter: it manufactures
trust the product has not earned. `docs/ECC-AUDIT.md` I-1 and I-2 are the only
`blocking` issues in the repo.

**Shape, decided this session.** Recovery keeps its nav slot and gains three
sections — Stretch, Breathe, Restore — with per-movement detail routes at
`/recover/[slug]` mirroring `/train/[slug]`. Full design parity with Workouts:
a generator driven by the profile, a movement library with cues and over-40
safety notes, the contraindication filter, detail pages, and session logging
that counts toward both the streak and the weekly challenge.

### C27 — Stop prescribing contraindicated recovery *(safety; do first)*

Restructure `lib/domain/recovery.ts` so each stretch step is a record rather
than a string: name, minutes or reps, cue, over-40 safety note, and the same
`MovementFlag[]` vocabulary C20 introduced. Route every routine through the
existing filter. Retag `MILESTONES` — "Touch toes with soft knees" and
"Full-depth goblet squat" both carry flags and must be swapped or gated, not
merely hidden, because a milestone that vanishes reads as a bug.

Ships alone, before anything cosmetic. Nothing here depends on C28–C32.

*Accept:* the same exhaustive sweep C20 uses, over routines instead of plans —
no flagged movement survives for `bone_health = 'osteoporosis'` in any profile
combination; the sweep is proven non-vacuous; `recovery.test.ts` exists.
`web/src/lib/domain/`, `web/src/app/(app)/progress/page.tsx`.

### C28 — Recovery movement library

Promote every stretch, breath and restore step into a first-class movement with
the same fields an exercise has: cues, safety note, easier and harder variation,
equipment, joints loaded, movement flags. Roughly 20 movements across the three
existing routines plus the lymph sequence.

*Accept:* `recoveryLibrary.test.ts` asserts every movement has cues, a safety
note and both variations — the assertion `plan.test.ts` already makes of the 28
exercises. No duplicate names across the combined libraries.

### C29 — `/recover/[slug]` detail pages

Mirror `train/[slug]`: cues, safety note, variations, `FitnessBuddy`, media
lookup, a hold/set timer, and the "withheld, and here is why" card from C20's
`movementRemovalReason()`.

*Accept:* every movement in the C28 library resolves from its slug; a user with
osteoporosis visiting a flagged movement's URL sees the withheld card, not a
prescription. Depends on C28.

### C30 — Recovery generator

`buildRecovery(profile)` alongside `buildPlan(profile)`, and it must be the same
kind of function: pure, profile-driven, filtered. Session length and level scale
the routine; `avail_days` places recovery days against training days instead of
describing them in a closing sentence; declarations shape content.

*Accept:* two profiles differing only in `session_len` get different routines;
the sweep from C27 still passes over generated output rather than fixed
routines. Depends on C27, C28.

### C31 — Log a recovery session

Add `'Mobility'` to the `events.type` CHECK. It flows into
`weekly_active_minutes` unchanged, so a logged stretch counts toward the streak
**and** the 150-minute weekly challenge — decided this session. Add the "Mark
session done ✓" button Recovery has never had.

*Accept:* migration verified against local Postgres before it goes near the
hosted project; a logged mobility session moves the streak and the challenge
bar; the outbox round-trips it. Touches `supabase/migrations/`, the events type
union, and `docs/M2-SCHEMA-CHANGELOG.md`.

### C32 — A pure stretching section

With C28–C30 in place, this is presentation: a dedicated Stretch section at the
top of Recovery with its own generated routine, its own entry point from Home,
and enough visual weight to read as a peer of the workout plan rather than a
footnote under the breathing timer.

*Accept:* a stretch-only session can be started, followed movement by movement,
and logged, without passing through a workout. Depends on C29, C30, C31.

*Gate for M7:* a user with declared osteoporosis can complete a full recovery
session — generated for their profile, every movement explained, none of them
contraindicated — and see it counted on Progress.

---

## Carried forward

### M1 — Harden the prototype
- **C1** *(70%)* Curate image overrides where the Commons lookup is poor; record
  the per-exercise pass. *Accept: every detail screen shows a relevant image or
  an honest fallback, verified for all 28.*
- **C2** *(85%)* Verify coach feedback against a rate-limited key. The API-key
  decision — project key vs. user-supplied — is still open and was deferred
  deliberately.
- **C5** *(0%)* Legal review of the disclaimer. External counsel. **Widened by
  M6 and again by M7**: the app now names medical conditions, changes
  programming because of them, and prescribes stretches. The stretch content has
  had no clinical review — see `docs/ECC-AUDIT.md` §7.

### M3 — Social
- **C11** *(40%)* The Sunday cron seeding each week's `challenges` row does not
  exist. Known and stated at `social/page.tsx:25`.
- **C12** *(70%)* Feed pagination; friends' events.

### M4 — Devices
- **C13–C15** Pairing is a 1400 ms `setTimeout`; the screen says so. Needs the
  Android wrapper before any of it is real.

### M5 — Buddy + media
- **C16** Rigged three.js buddy. **Scope grows with M7** — it must now cover
  recovery movement patterns too, per goal 5.
- **C17** Licensed or shot demo video.
- **C18** On-device pose model; reps and HR are simulated at a fixed cadence
  today, disclosed in the UI.

### M6 — Condition-aware programming
C19 and C20 are done. C21 is the substantive one: eight generator rules, each
carrying a reason string, with the composition test as the real gate rather than
the per-rule ones. C22–C26 follow. Detail in
`docs/M6-CONDITION-AWARE-PLAN.md`.

**C21 and C30 collide** — both are plan generators reading the same
declarations, and C30 will want C21's reason strings. Sequence C21 → C30, or
accept that C30 rewires when C21 lands.

### Documentation debt
- **W1** `docs/M2-SCHEMA-CHANGELOG.md` is three migrations behind: the profile
  backfill, `gymapp_condition_profile`, and C31's mobility type.
- **W2** `web/README.md` is still the `create-next-app` text.

### Live project configuration *(not code; blocks nothing, risks everything)*
Rotate the `service_role` key pasted into chat. Point Site URL and redirect URLs
at `gymapp-two-phi.vercel.app`. Add `gymapp` to Exposed schemas. Configure
custom SMTP.

---

## Concurrency map

**Parallel-safe:**
- C27 ∥ C21 — different modules, no shared file.
- C28 ∥ C21 — C28 is content authoring.
- W1, W2 ∥ anything.
- C16 ∥ everything — isolated component.

**Collisions, and what they collide on:**
- C21 → C30 — shared: the declaration-reading generator surface and reason
  strings.
- C27 → C30 — shared: `lib/domain/recovery.ts` structure. C30 rewrites what C27
  restructures.
- C28 → C29 — shared: the movement library C29 renders.
- C29 ∥ C31 collide on nothing, but both touch `recover-screen.tsx`; land C29
  first.
- C31 ∥ any other migration — shared: `supabase/migrations/`. Only one migration
  in flight at a time, and only after it is verified against local Postgres.
- C16 → C18 — camera screen, unchanged from the original plan.

**Suggested order:** C27 (alone, it is the safety fix) → C28 → C29 ∥ C31 → C30
→ C32, with C21 running alongside from the start and merging before C30.

---

## Not in scope until decided

Vegan and pescatarian tiers, meal-photo logging, wearables beyond Health Connect
and HealthKit, a coach marketplace. Other age bands (55–65, 65+, under 45),
pregnancy and postpartum, cardiac rehab, and anything needing a clinician in the
loop rather than a checkbox.
