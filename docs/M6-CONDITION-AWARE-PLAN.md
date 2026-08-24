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

### C19 — Profile fields and intake *(schema done, UI to build)*

`supabase/migrations/20260823190000_condition_profile.sql` — written, verified
against Postgres, **not yet applied to the hosted project**. It is purely
additive: every column is nullable with no default, so existing rows stay valid
and "not asked" stays distinguishable from an answered "none".

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

### C20 — Exercise contraindication metadata

Add `contra?: ConditionFlag[]` to each entry in `lib/domain/exercises.ts` — a
static TS library, so no migration. Tag loaded spinal flexion and end-range
rotation (`Superman hold`, and any crunch/sit-up/twist added later) with
`osteoporosis`.

Extend the existing `safe()` filter in `plan.ts` to drop contraindicated
movements the same way it already drops injury-loading ones. One filter, two
inputs.

*Accept:* with `bone_health = osteoporosis`, no plan in any goal × kit × length
× focus combination contains a tagged movement — asserted the same exhaustive
way the injury tests already are.

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
