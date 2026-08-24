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
| M6 Condition-aware | **C19–C25 done** · C26 deferred |
| M7 Recovery parity | **Done** — C27–C32 |

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

### C27 — Stop prescribing contraindicated recovery *(done)*

Restructure `lib/domain/recovery.ts` so each stretch step is a record rather
than a string: name, minutes or reps, cue, over-40 safety note, and the same
`MovementFlag[]` vocabulary C20 introduced. Route every routine through the
existing filter. Retag `MILESTONES` — "Touch toes with soft knees" and
"Full-depth goblet squat" both carry flags and must be swapped or gated, not
merely hidden, because a milestone that vanishes reads as a bug.

Ships alone, before anything cosmetic. Nothing here depends on C28–C32.

**Recovery swaps rather than drops**, which is the one design decision worth
carrying forward. `buildPlan` picks from a pool, so removing an exercise means
taking the next one. A stretch routine is a curated sequence with a stated
duration — dropping a step leaves a three-move "8 min" routine that no longer
takes 8 minutes. Every flagged move carries a `swap` that serves the same
purpose without the mechanic, and the screen names what changed and why.

The milestone fix falls out of the same idea. `profiles.mobility` is a
`boolean[5]` with a CHECK, indexed positionally, so a flagged milestone is
replaced *in its slot*: slot 0 means "the hamstring-length milestone", filled by
a toe-touch for most people and a supine straight-leg raise for someone with
declared osteoporosis. Ticks stay meaningful, the array still lines up, no
migration.

Injuries deliberately do **not** filter stretches — a flagged knee is a reason
to load it less, not to stop moving it. Whether any individual stretch should be
injury-gated is per-movement metadata, and belongs in C28.

*Accept:* met. `recovery.test.ts` — 17 tests. The sweep asserts no flagged move
survives for `bone_health = 'osteoporosis'` across every routine, the lymph
sequence and the milestones; a companion asserts it is non-vacuous; others
assert routines keep their length and `min`, milestones stay at exactly five,
osteopenia changes nothing, and no swap is itself flagged. Mutation-verified
twice: neutering `resolveMove` fails 3, neutering `milestonesFor` fails 1.

### C28 — Recovery movement library *(done)*

`lib/domain/recovery-library.ts` — 23 movements, each carrying what an exercise
carries: cues, an over-40 safety note, easier and harder variations, movement
flags. `recovery.ts` keeps the routines and the filter.

Three deviations from the draft, each earning its keep:

*Dose moved to the routine.* `Quadruped rock-back` was two entries before this
— "× 8" in the morning flow and a "90 s" hold in the evening — because name and
dose were one string. One movement at two doses is what it always was, and is
what lets C29 give it a single detail page. A test rejects any name that still
looks like it carries a dose.

*Swaps became references.* C27 attached each replacement as a nested literal
with a cue and a note and nothing else — so a swapped-in movement was a
second-class citizen prescribed to exactly the users needing the most
information. A swap now names another library entry, and the resolver returns
that entry in full.

*`props` instead of equipment, and `av` recorded but not filtered.* Nothing here
needs a gym; what varies is whether you need a wall, a chair or a towel, and
those are listed so nobody starts a routine and finds out halfway through.
C27's reasoning on injuries stands — the metadata is here so C30 can judge per
movement rather than applying a blanket rule.

Box breathing joined the library, which gave the breathing timer the safety note
it never had: the holds are the part that matters with high blood pressure. It
is tagged `valsalva` for C21.

*Accept:* met, and widened. 25 tests. Every movement has cues, a safety note and
both variations — the bar `plan.test.ts` holds the 28 exercises to. Beyond the
draft: no slug collides with an exercise slug (C29 needs that), every routine
step and every swap resolves to a real entry, no swap target is itself flagged,
and nothing in the library is unreachable. Mutation-verified three ways —
neutering the filter fails 4, a slug collision fails 6, an orphaned entry fails
1.

### C29 — `/recover/[slug]` detail pages *(done)*

Mirrors `train/[slug]`: cues, safety note, variations, `FitnessBuddy`, media
lookup, a timer, and the withheld card. Every routine step and lymph row on
`/recover` is now a link, as every exercise row on `/train` already was.

Four places it deliberately diverges, because recovery is different rather than
lesser:

*The timer counts down for a hold.* A stopwatch on a 90-second stretch asks the
user to watch the screen and decide when to stop — the decision the dose already
made. `holdSeconds()` reads the dose; rep-based movements still count up. A
finished per-side countdown restarts in one tap ("Other side"), because making
someone press Reset first is a tap that exists only because the state machine
leaked into the UI.

*The dose rides in the query string.* It belongs to the routine, not the
movement (C28), so `/recover/quadruped-rock-back?dose=90%20s` is a hold and
`?dose=%C3%97%208` is eight reps. A movement reached without one — bookmark,
shared link — renders with no target rather than inventing a duration.

*A withheld movement names its replacement and links to it.* The exercise page
can only say "not in your plan"; here there is always somewhere better to send
them.

*No media lookup for drainage and breath movements.* Their names are body-part
words — "armpit pump", "abdominal circles" — and open media libraries answer
those with anatomy photographs and worse. The keyword filter and junk-domain
blocklist exist because "step up" once resolved to a mass-casualty exercise
photo; this is the same failure mode at a much higher cost, so the query is
never made. No "Do it live" button either: the live screen counts reps, which
means nothing for a hold.

`buddyForRecovery(kind)` was added because every recovery movement fell through
`buddyFor`'s name patterns to "steady movement — keep breathing, stay tall",
which for a three-minute legs-up-the-wall is actively wrong: the movement is
stillness. Dispatching on `kind` uses data the library already carries.

*Accept:* met. 33 tests. Every library movement round-trips its slug; every
withheld movement has both a reason and a resolvable replacement; nothing is
withheld from someone who declared nothing; every dose in every routine parses
to a plausible hold or a rep count, and a rep count is never mistaken for a
duration.

### C30 — Recovery generator *(done)*

`buildRecovery(settings)` in `lib/domain/recovery-plan.ts`, the same kind of
function as `buildPlan`: pure, profile-driven, filtered. Recovery days are the
days `avail_days` leaves free — the closing sentence made real. `session_len`
and `level` set a movement budget. The C27 filter runs over generated output,
and every substitution is reported on the day carrying it.

**The three hand-written routines are kept as templates, not discarded.** They
are user-approved prototype content and the only place the sequencing was
thought about; a generator that threw them away to prove it could would be worse
at the job. Short of budget they top up from the library, over budget they trim.

**Doses are not scaled.** A 45-second doorway stretch is 45 seconds whether you
have ten minutes or an hour. Length changes the count.

Four defects this chunk found and fixed, three of them only visible by printing
real output rather than reading assertions:

*The swap carried the wrong dose.* Since C27 the step's dose was carried onto
the replacement unconditionally, so declaring osteoporosis and opening Evening
unwind prescribed "90/90 breathing — 60 s / side", a breath drill with a side.
Movements now carry their own dose (the generator needs one anyway) and a step's
dose is an override that wins only when the routine deliberately set it.

*The reason said "Not in your plan" beside the replacement.* Correct on the
detail page, wrong on a card showing what took its place.
`movementSwapReason()` splits off the shared core.

*One reason line covered swaps with different mechanisms.* Three swaps under
"bends the spine forward" is wrong about the rotation one. Grouped by
explanation now.

*Pelvic floor got handed the braced breath drill first.* Leading with breath
work, then offering `Box breathing` — whose holds are the one thing in that
group raising intra-abdominal pressure — is backwards. The day rotation was
being applied after the preference sort and stepping past it; it now rotates
first and varies only within each tier.

Pelvic floor reorders and removes nothing, deliberately: no impact work exists
here for C21's rule to bite on, and ordering is the honest strength of claim.

*Known trade-off:* trimming takes from the end, so a 10-minute Evening unwind
loses "Legs up the wall", its signature movement. Priority within a template is
C32's problem, not a reason to hold C30.

*Accept:* met. 23 tests. Movement count rises with `session_len` and hits the
budget exactly for all 15 length × level combinations; the C27 sweep passes over
generated output across lengths, levels, four `avail_days` shapes and both
pelvic-floor states, with a non-vacuity guard. Mutation-verified three ways —
bypassing the filter in the top-up fails 1, a fixed budget fails 3, ignoring
training days fails 3.

### C31 — Log a recovery session *(done)*

`'Mobility'` added to the `events.type` CHECK, applied to the hosted project as
`gymapp_mobility_event_type` after the full migration set and RLS suite passed
against a scratch Postgres. It flows into `weekly_active_minutes` unchanged, so
a logged stretch counts toward the streak **and** the 150-minute challenge.
Every generated session card now carries "Mark session done ✓", logging its own
estimated minutes.

The trade-off is recorded in the migration and the changelog rather than left to
be discovered: someone can now reach 150 "active minutes" a week entirely on
stretching. That is the right way round — a challenge that refuses to count
recovery teaches people recovery does not count.

Two things this turned up beyond the chunk. `lib/sync/legacy.ts` held the import
whitelist as an array, so a stale copy would have silently rewritten every
imported mobility session as "Other sport"; it is now a `Record<EventType,
true>` and the compiler refuses to build when the union grows. And the RLS suite
gained `assert_rejected` alongside `assert_denied` — a rejected value and a
refused permission are different failures, and one helper accepting either would
let a broken constraint pass whenever the row happened to be unwritable for an
unrelated reason.

*Accept:* met. Verified locally before the hosted project, and the constraint
read back from live. Four new assertions in the RLS suite: the CHECK accepts
`Mobility`, the weekly view counts it, the CHECK still rejects an unknown value,
and the streak counts a mobility date. Mutation-verified twice — not widening
the CHECK fails the insert, filtering `Mobility` out of the view fails the
assertion by name.

### C32 — A pure stretching section *(done)*

Recovery now reads as three sections — **Stretch**, **Breathe**, **Restore** —
and Stretch leads. Before this the screen opened with a breathing timer and put
stretching in a grid of equal cards below the fold, which was a fair description
of how much the product thought stretching mattered.

The Stretch section carries today's generated session (or the next one, because
"nothing scheduled, come back Tuesday" is not a useful thing for a stretch
section to say), with **Start session**, the numbered movement list, and **Mark
session done ✓**. Home's "10-min desk reset" tile becomes "Today's stretch".

**Following a session reuses the detail page rather than adding a second
screen.** `/recover/[slug]` already has the cues, safety note, variations and
timer; a guided run is that page in sequence, so position is threaded through
the URL as `?day=&i=`. A second screen would have had to keep all of it in step.
Each movement shows a progress bar, what is next, and — on the last one —
**Finish and log ✓**, which writes the C31 mobility event and returns to
Recovery.

Position is re-resolved against a freshly generated week on arrival. A link
shared or bookmarked before a declaration changed can name a movement no longer
at that index; the page falls back to standalone rather than showing someone a
session they are not in.

**C30's deferred trade-off is closed.** Trimming took from the end, which
removed "Legs up the wall" — the entire reason Evening unwind is restful — from
every session under six movements. Steps can now be marked `keep`; `pickSteps()`
takes those first, fills in order, then restores template order, so a closer
stays a closer. A 10-minute Evening unwind is now Child's pose plus Legs up the
wall rather than Child's pose plus Figure-4.

*Accept:* met. 9 new tests, 231 total. A session walks first movement to last
through generated hrefs and arrives at `isLast`; every `keep` step survives every
budget in every template with order preserved; stale and malformed positions
resolve to null. Mutation-verified twice — trimming from the end fails 3,
accepting a stale position fails 1.

*Gate for M7:* **met.** A user with declared osteoporosis gets a session
generated for their profile, placed on a day training leaves free, with every
movement explained and none of them contraindicated, followable movement by
movement, and counted on Progress when they finish it.

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
C19, C20 and **C21** are done. C22–C26 follow. Detail in
`docs/M6-CONDITION-AWARE-PLAN.md`.

**The C21/C30 collision resolved itself.** Both read the same declarations, and
the plan said to sequence C21 first or accept a rewire. C30 landed first and
needed no rewiring, because `removedMovementFlags()` was already the single
place both generators asked what to filter — C21 pointed it at the new rule set
and every screen picked the new removals up at once.

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
