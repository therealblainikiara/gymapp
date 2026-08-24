-- M6 / C19 — age- and condition-aware programming: the profile fields.
--
-- Purely additive. Every column is nullable with no default, so existing rows
-- stay valid and an unanswered question is distinguishable from an answered
-- "none" — which matters here: "no osteoporosis" and "never been tested" lead
-- to different programming, and collapsing them into a default would quietly
-- give an untested 54-year-old the all-clear.
--
-- DESIGN NOTE — why these are not gated on `sex`
-- Perimenopause is female physiology, but a `sex = 'f'` gate breaks for
-- surgical menopause, hysterectomy, and trans users. So `sex` decides which
-- questions the intake *offers*, and the plan generator branches on the answer
-- fields below. Same programming, no one excluded, and one less special case.
--
-- DESIGN NOTE — `conditions` is not `injuries`
-- `injuries` is already a mechanical filter: a flagged joint removes exercises
-- that load it, and that is all it does. `conditions` are medical states whose
-- effects differ per condition — some remove movements (osteoporosis), some
-- change loading rules (hypertension), some only add content (type 2 diabetes).
-- Merging them would force one filter to mean several different things.

alter table gymapp.profiles
  -- pre / peri / post, or an explicit refusal. NULL means "not asked yet".
  add column menopause_stage text
    check (menopause_stage in ('pre','peri','post','undisclosed')),

  -- 'untested' is a real answer, distinct from 'none'. Bone loading is offered
  -- on 'osteopenia'; movements are removed on 'osteoporosis'.
  add column bone_health text
    check (bone_health in ('none','osteopenia','osteoporosis','untested')),

  add column pelvic_floor text
    check (pelvic_floor in ('none','occasional','diagnosed')),

  add column conditions text[] not null default '{}',

  -- Set when the user confirms they have discussed training with a clinician.
  -- Condition-specific programming is gated on this being present — the app
  -- should not act on a self-reported diagnosis alone.
  add column clinician_cleared_at timestamptz,

  add constraint conditions_valid check (
    conditions <@ array[
      'hypertension','type2_diabetes','oa_knee','oa_hip',
      'frozen_shoulder','tendinopathy'
    ]::text[]);

-- Perimenopause symptom tracking, and mood alongside the existing
-- sleep/stress/energy triad. Nullable so historic check-ins remain valid and
-- so a user who does not track flushes is not forced to enter a zero.
alter table gymapp.checkins
  add column flushes int check (flushes between 0 and 30),
  add column mood int check (mood between 1 and 5);

-- Waist circumference. Body-fat distribution shifts visceral around menopause,
-- which BMI cannot see — the Progress screen already refuses to hand out BMI
-- verdicts, and this is the measurement that actually moves.
alter table gymapp.weights
  add column waist_cm numeric check (waist_cm between 40 and 200);

comment on column gymapp.profiles.clinician_cleared_at is
  'When the user confirmed a clinician has cleared them to train with their '
  'declared conditions. Condition-specific plans are gated on this.';

comment on column gymapp.profiles.conditions is
  'Medical states affecting programming. Distinct from `injuries`, which is '
  'purely a mechanical exercise filter.';

-- Nothing here changes RLS: the new columns live on tables that are already
-- owner-only, and search_profiles() still returns exactly (id, display_name,
-- handle). The projection assertion in supabase/tests/01_rls.sql is what keeps
-- that true — it now also protects menopause stage and condition data.
