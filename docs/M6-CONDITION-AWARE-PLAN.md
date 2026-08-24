# M6 — Age- and condition-aware programming

Extends `docs/ECC-PLAN.md` with a sixth milestone. Scope for this pass is the
**45–55 band**; the design deliberately generalises so later bands add data, not
code.

## Goal (testable)

A user who declares perimenopause, osteopenia and knee osteoarthritis gets a
plan that adds bone loading, shifts to heavier low-rep work, caps squat depth to
pain-free range, and never prescribes a movement contraindicated for their bone
status — and can see, on the plan itself, which of those changes came from which
declaration.

That last clause is the part that makes it trustworthy rather than magic.

## Two rules that shape everything below

**1. Age offers a question; the answer drives the plan.** No variation is gated
on age or sex alone. A 58-year-old with osteopenia gets the bone block; a
54-year-old without it does not. Age decides which questions intake asks, `sex`
decides which are offered by default, and the plan branches on the answers.
Otherwise this table gets rewritten for every band added.

**2. Nothing condition-specific fires without `clinician_cleared_at`.** A
self-reported diagnosis is enough to *ask* about, not enough to program on.
Until the box is ticked the user gets the standard over-40s plan plus a prompt.

## Chunks

### C19 — Profile fields and intake *(done)*

`supabase/migrations/20260823190000_condition_profile.sql` — applied to the
hosted project as `gymapp_condition_profile`. It is purely additive: every
column is nullable with no default, so existing rows stay valid and "not asked"
stays distinguishable from an answered "none".

| Table | Added |
|---|---|
| `profiles` | `menopause_stage`, `bone_health`, `pelvic_floor`, `conditions[]`, `clinician_cleared_at` |
| `checkins` | `flushes`, `mood` |
| `weights` | `waist_cm` |

To build: intake step 8 (conditional), the matching Setup section, and the
clearance checkbox. Client-side validators must mirror every new CHECK — the
outbox stalls behind a rejected write, so this is not optional.

*Accept:* a user can declare and later change every field; values round-trip
through the outbox; RLS suite still passes.

### C20 — Exercise contraindication metadata *(done)*

`contra?: MovementFlag[]` on each entry in `lib/domain/exercises.ts` — a static
TS library, so no migration. `safe()` in `plan.ts` now drops flagged movements
the same way it drops injury-loading ones: one filter, three inputs (kit,
injuries, declarations).

**Two deliberate changes from the plan as drafted.**

*Tag by mechanism, not by condition.* The draft said `contra: ["osteoporosis"]`.
Tagging what a movement *does* — `spinal_flexion`, `overhead`, `impact`,
`deep_knee_flexion`, `valsalva`, `isometric_hold`, `spinal_rotation` — means the
frozen-shoulder rule, the BP rule and anything a later age band adds all read
the same tag instead of re-tagging the library each time. C20 removes on spinal
flexion and rotation only; the rest are tagged now so C21 is rules and nothing
else. `impact` currently tags nothing, because nothing in the library is impact
— C21's bone-loading block is what will carry it.

*`Superman hold` is not flagged for bone health.* The draft named it as the
example, which was wrong: it is prone **extension**, and extension work is
recommended in osteoporosis rather than avoided. Flexion is the fracture
mechanism. The movements actually flagged are `Bent-over dumbbell row`,
`Dumbbell Romanian deadlift` and `Inchworm walk-out`.

**Removals are not behind the clinician gate.** Rule 2 governs what the plan
*adds* — a bone-loading block is programming and needs a clinician. Withholding
a loaded toe-touch from someone who has told us they have osteoporosis is the
absence of programming, and gating it would protect us at their expense.
`removedMovementFlags()` therefore reads `bone_health` alone;
`conditionProgrammingActive()` keeps the gate for everything C21 adds.

Osteopenia removes nothing on purpose — the evidence favours loading that spine
carefully over avoiding it, so C21 treats it as an adjustment.

Two supporting pieces the draft did not call for but the filter needs:
`ALWAYS_SAFE`, the last-resort movement, is now *derived* from the library
(first bodyweight entry with no `av` and no flags) rather than hard-coded to
`core.ex[0]`, because that path bypasses `safe()` and would otherwise start
handing out an unsafe movement the day someone tags dead bug. And
`movementRemovalReason()` puts a "withheld, and here is why" card on the
exercise detail page — the plan silently omits these, but the detail page stays
reachable by link, and an unexplained omission is what people route around.

*Accept:* met. `plan.test.ts` sweeps all 5 goals × 2 kits × 5 lengths × 9 focus
sets and asserts no flagged movement survives; a companion test asserts the
sweep is not vacuous (each flagged movement *does* appear with no declaration),
one asserts the filter fires without clearance, and one asserts it fires only on
osteoporosis. Verified by mutation: blanking `removedMovementFlags` fails 2
tests.

### C21 — Plan generator rules *(done)*

The substantive chunk. Each rule is a pure function over the profile:

| Rule | Effect |
|---|---|
| Bone loading | Appends an impact block, 2×/wk, progressive 10→50 reps |
| Rep-range shift | Compound lifts 10–12 → 6–8 at higher intensity |
| Pelvic floor | Removes impact and heavy Valsalva; reintroduces on symptom-free |
| Blood pressure | Drops maximal overhead work and >30 s isometrics; adds exhale cue, longer rests |
| Tendinopathy | Swaps the affected pattern for isometrics → slow heavy resistance |
| OA knee/hip | Caps depth; box squat, lower step, cycling over running |
| Frozen shoulder | Nothing overhead; below-shoulder strength only |
| Resistance floor | ≥2 full-body sessions/wk regardless of goal |

Each returns a **reason string** attached to the day, so the UI can show "heavier
sets — you told us you're perimenopausal" rather than silently changing the plan.

**Built in `lib/domain/rules.ts`.** `applyRules(declarations)` returns one
`Adjustments` value that `buildPlan` reads: what to remove, a rep override,
extra rest, whether to append bone loading, a full-body floor, coaching notes,
and the reason strings.

Four decisions worth recording.

*`removalsFor()` became the single source of removals.* `removedMovementFlags()`
in `conditions.ts` now delegates to it, so a rule added in C21 reaches the
workout filter, the recovery filter and both detail pages at once. That is the
M7 lesson applied before it could bite again.

*The `valsalva` flag had to be split.* It tagged both a loaded squat and box
breathing, and the pelvic-floor rule removes heavy Valsalva — which would have
removed box breathing, whose four-second pauses are the opposite of the
mechanism. `breath_hold` now covers unloaded pauses; blood pressure reads both,
the pelvic floor reads one.

*Hypertension does not remove overhead work.* The table says "drops maximal
overhead work", but "maximal" is a load, not a movement, and taking the press
away from someone who can press safely is the wrong instrument. It removes
`isometric_hold`, lengthens rests by 30 s and adds an exhale cue.

*Tendinopathy is a note, not a swap.* `conditions` records that there is a
tendinopathy, not where. There is no affected pattern to swap, and inventing one
from a list that cannot name a site would be worse than saying so. The reason
string says so to the user too.

**Composition works through `safe()` rather than through the rules knowing about
each other.** The bone rule appends impact work; the pelvic-floor rule removes
impact; the block runs through the same filter as everything else and empties
itself. `boneLoadingBlocked` exists so the screen says "ask your clinician which
matters more for you" instead of showing an empty block.

Bone-loading movements live outside `EXERCISE_DB` so the muscle rotation can
never draw them into an ordinary plan, but `findExercise` searches them, so a
prescribed drill has a detail page like everything else. They come out of the
session budget rather than being bolted on top of the time the user said they
had.

*Accept:* met. 32 tests in `rules.test.ts` plus 10 in `plan.test.ts`. One test
per rule proving it fires on its trigger and only on its trigger; the gate
proven to hold back every addition and not one removal; the BP + bone-loading
composition proven not to prescribe max-effort impact; the pelvic-floor + bone
contradiction proven to resolve toward the removal *and say so*. Mutation-
verified three ways — ignoring the gate fails 2, gating removals fails 5,
letting bone loading beat the pelvic floor fails 2.

Three defects only real generated output revealed: three impact drills at once
contradicted the progression in their own safety notes (now two, and `Low hop`
was folded into `Heel drop`'s harder variation rather than left as dead
content); the block ignored the session budget; and the rep-shift reason claimed
"compound lifts" while the override reached every movement.

### C22 — Check-in autoregulation *(done)*

`autoregulate(checkin, settings)` and `autoregulated(day, a)` in `plan.ts`.
`sleep ≤ 2` drops one set and lowers the intensity target for that day, keeping
the session rather than skipping it. Reads the existing check-in; no new data.

**Not behind the clinician gate, and not a condition rule.** This is ordinary
training sense that applies to everyone who checks in, declared or not. Routing
it through `conditionProgrammingActive` would make a night of bad sleep matter
only to people with a diagnosis.

**Applied to today, not to the week.** It lives outside `buildPlan` and is
applied by Home to the day `todaysPlan` returns. One bad night is not a reason
for Thursday's session to shrink.

**Sleep is the only trigger**, per this plan. Energy and stress sit on the same
form and are tempting to fold in, but they move for reasons that have nothing to
do with recovery capacity — a stressful week is often a reason to train, not to
train less.

Two edges worth naming. `setsForLevel` floors at two and a one-set session is
not a session, so a beginner already at the floor keeps their sets and gets the
intensity cut instead — and the reason says so rather than silently doing
nothing. Finishers and the bone-loading block are skipped: neither is a working
set, and the block is already the lightest thing in the session.

*Accept:* met. 9 tests. The plan differs on a poor-sleep day, says why on that
day, and composes with C21 rather than overwriting it — a perimenopausal profile
on a bad night gets "2 × 6–8", keeping the rep range C21 moved.
Mutation-verified three ways.

One test was rewritten after a mutation check exposed it as vacuous: the
finisher guard could be deleted with every test still passing, because the real
finisher scheme ("Finisher") is unparseable anyway. It now builds a day with
parseable schemes on purpose, which is the case the guard actually exists for.

### C23 — Recover additions *(done)*

`lib/domain/protocols.ts` — three protocols, rendered as their own section on
Recovery when the declaration calls for them, plus `warmUpCopy(age)` feeding the
warm-up line on every plan card. Content plus conditional rendering, exactly as
scoped: nothing prescribed, nothing removed, no generator touched.

| Protocol | Shown to | Covers |
|---|---|---|
| Thermoregulation | peri, post | Training through a flush — timing, layers, cooling the pulse points |
| Sleep disruption | peri, post | The 3am wake-up — room temperature, bedding, what to do when you wake |
| Load management | peri only | Progressing when tendons adapt slower than muscle |

**Not behind the clinician gate, deliberately.** The gate exists because
prescribing exercise on a self-reported diagnosis carries risk. "Keep a cold
drink to hand" carries none. C20 put removals outside the gate because
withholding is the absence of programming; the same reasoning puts guidance on
the other side of the same line, and making someone find a clinician before they
can read what tends to help would be the gate working against them. The
programming these protocols talk around — the rep shift, the longer rests — is
C21's, and that is gated.

**Load management is perimenopause only.** It is about the rate of change, not
the end state: post-menopause the fall has happened and the tendon has adapted
to where it is.

**The warm-up is the one thing in M6 that keys off age**, and it is worth
defending rather than hiding. Rule 1 forbids using age as a proxy for a
condition — "she is 52 so she must be menopausal". It does not require
pretending joints do not change with age, and warm-up length is general practice
for older joints rather than condition-specific programming. An unknown age gets
the longer warm-up, consistently with `offersHealthStep`: a blank field is not
evidence of being young.

*Accept:* met. 13 tests. Every protocol has steps, a note and a when; nothing in
the library is unreachable; the branch is on `menopause_stage` alone, so age
cannot leak in as a proxy — `protocolsFor` takes one argument and the test
asserts its arity. Mutation-verified three ways: showing protocols to everyone
fails 1, showing load management post-menopause fails 2, treating an unknown age
as young fails 1.

### C24 — Diet additions *(done)*

Diet was the last screen reading none of the declarations. `dailyTargets` now
takes an optional `declarations`, and Diet passes the profile.

**The protein raise is driven by the declaration, not by age — and this chunk's
own accept criterion is what caught it.** The plan said "1.6 → 2.0 g/kg for
45+". The existing Mifflin-St Jeor fixture is a 47-year-old expecting 135 g and
is required to pass unchanged, so age cannot be the trigger; rule 1 says it
should not be either. Driving it off `menopause_stage` or `bone_health` is
better evidence anyway: 1.6 g/kg is already this app's over-40s baseline, twice
the general population figure, and the step to 2.0 is the response to muscle and
bone loss accelerating — which the declaration marks and a birthday does not. A
well-written accept criterion catching a contradiction in its own chunk is the
system working.

**Micronutrients are food-first and supplements are a clinician's call.**
Calcium and vitamin D for menopause or low bone density; iron for perimenopause
only, because after the last period the loss stops and carrying the flag forward
would have people supplementing iron they no longer lose. Iron's "amount" is *ask
for a ferritin test*, never a dose — it is the one micronutrient where guessing
is actively harmful, since excess is toxic and the symptoms of low and high
overlap. A test asserts no dose in milligrams ever appears there.

Ungated, consistently with C23. These are public-health figures anyone can look
up, and withholding them from someone who declared osteoporosis until they tick
a box would leave them with less information than a leaflet. The screen carries
an explicit "talk to your GP or pharmacist before buying any of it" line.

**Flush triggers are derived from the ingredient list, not hand-tagged per
meal**, so a meal added later is covered without anyone remembering. The cost of
deriving is false positives, so the keywords are narrow: "chilli" but never
"pepper", because the hummus snack has bell peppers in it and a tag that fires
on those trains people to ignore it. Nothing is filtered — alcohol, caffeine and
spice are triggers for some people on some days, and removing a meal on a guess
would be worse than saying what is in it. Tags show only to someone who declared
a menopause stage.

*Accept:* met. 19 new tests. The existing Mifflin-St Jeor tests pass untouched.
Mutation-verified three ways: raising protein for everyone fails 6, carrying
iron past perimenopause fails 1, adding "pepper" to the chilli keyword fails 2.

### C25 — Progress additions *(done)*

Closes the last of C19's dead columns. `checkins.flushes`, `checkins.mood` and
`weights.waist_cm` shipped to production two days ago and nothing had read or
written any of them since.

**Symptom tracking is offered only to someone who declared a menopause stage.**
A five-question daily form is a form people abandon, and asking a 30-year-old
man about flushes is noise that teaches everyone to skip the whole thing.
Flushes are a **count** with a stepper, not a 1–5 scale: "how many" is a fact
the user knows, where "rate your flushes" is a judgement nobody makes
consistently day to day. An untouched field stays null rather than defaulting to
a middle value — an invented 3 is indistinguishable from a real one and would
flatten the very pattern this exists to show.

**Function tests needed a migration** — `20260824140000_function_tests.sql`,
applied as `gymapp_function_tests`. `grip_kg`, `sit_to_stand` and `balance_sec`
join `waist_cm` on `gymapp.weights`, which is already the measurements table in
everything but name. Verified against the full migration set on a scratch
Postgres before the hosted project, and the columns read back from live.

**No verdicts, and that is not a style choice.** Published norms for these tests
are stratified by age and sex, so a verdict means telling a 55-year-old woman
she is "below average for her age" — a clinical judgement this app is not
qualified to make and a demotivating one to be wrong about. It is the same
reasoning that already keeps BMI categories off this screen. A test greps the
copy for "average", "normal", "below", "percentile" and "for your age" so a
verdict cannot drift in later.

*Accept:* met. 18 tests plus four DB assertions. Missing readings are skipped
rather than zeroed — logging a weight and no grip reading is the normal case,
and a zero would draw a cliff on the chart that never happened.
Mutation-verified three ways: zeroing missing readings fails 2, dropping the
bounds check fails 1, and slipping a verdict into the copy fails 1.

### C26 — Blood pressure log *(deferred, and still deferred)*

C21's blood-pressure rule shipped without needing one: it removes long holds,
lengthens rests and adds an exhale cue, none of which reads a logged reading.
The trigger for building this remains evidence that users want it.

## Sequence

```
C19 ─┬─ C20 ── C21 ─┬─ C22
     │              └─ C25 (symptoms)
     ├─ C23
     └─ C24
```

C20 blocks C21 (the generator needs the metadata). C23 and C24 are content-only
and can go in parallel with either. C26 waits for evidence.

## Risks worth naming

**The legal review just got more important.** The app now names medical
conditions and changes programming because of them. C5 in ECC-PLAN was already
open; this widens what counsel needs to look at, and the `clinician_cleared_at`
gate exists partly to narrow it.

**Osteoporosis is the only rule that removes rather than adjusts.** It is
therefore the only one where a bug is a safety issue rather than a quality one,
which is why C20 gets exhaustive combinatorial tests rather than samples.

**Composition is where this gets hard.** Eight rules that each work alone can
still produce nonsense together. The combined test in C21 is the real gate, not
the per-rule ones.

## Not in this milestone

Other age bands (55–65, 65+, under 45), pregnancy and postpartum, cardiac
rehab, and anything requiring a clinician in the loop rather than a checkbox.
