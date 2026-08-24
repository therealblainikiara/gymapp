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

### C21 — Plan generator rules

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

*Accept:* one test per rule proving it fires on the trigger and only on the
trigger; a combined test proving rules compose without contradicting (BP + bone
loading must not prescribe max-effort impact).

### C22 — Check-in autoregulation

`sleep ≤ 2` drops one set and lowers the intensity target for that day, keeping
the session rather than skipping it. Reads the existing check-in; no new data.

*Accept:* plan for the same profile differs on a poor-sleep day and says why.

### C23 — Recover additions

Thermoregulation protocol, sleep-disruption routine, warm-up extended 5 → 8–10
min for 45+, and load-management coaching for peri. Content plus conditional
rendering — no generator changes.

### C24 — Diet additions

Calcium and vitamin D targets, protein 1.6 → 2.0 g/kg for 45+, iron flag, and
flush-trigger tags on alcohol/caffeine/spicy items. Extends `nutrition.ts`,
which is already pure and well covered.

*Accept:* targets change when the declarations change; the existing
Mifflin-St Jeor tests still pass unchanged.

### C25 — Progress additions

Symptom tracking on the daily check-in (flushes, mood), waist circumference
beside weight, and function milestones — grip strength, 30 s sit-to-stand,
single-leg balance — which predict outcomes better than weight does.

Note the framing already established: the Progress screen refuses to hand out
BMI verdicts, and waist is the measurement that actually moves at menopause.

### C26 — Blood pressure log *(deferred)*

Its own table and migration, when C21's BP rule proves it is wanted. Not built
speculatively.

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
