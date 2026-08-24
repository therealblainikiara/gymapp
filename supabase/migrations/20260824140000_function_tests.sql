-- M6 / C25 — the measurements that predict outcomes better than weight does.
--
-- Grip strength, 30-second sit-to-stand and single-leg balance are the three
-- field tests with the best evidence behind them for people over 45. They
-- predict falls, fractures, independence and all-cause mortality better than
-- body weight, and unlike weight they respond to training in a direction the
-- user can feel.
--
-- They go in `gymapp.weights` rather than a new table because that is already
-- the measurements table in everything but name: C19 put `waist_cm` there for
-- the same reason. Same cadence (nobody measures these daily), same primary
-- key, same RLS policy, no new grants to get wrong. Renaming the table to
-- `measurements` would be the tidier choice and is not worth a breaking
-- migration on a live database for.
--
-- Every column is nullable: someone who logs a weight and no grip reading is
-- the normal case, and a default would invent a measurement nobody took.
--
-- CHECK bounds are set to reject typos, not to police performance. The top of
-- each range is comfortably beyond any plausible human value so that nobody's
-- genuine result is refused — a rejected write stalls the whole outbox behind
-- it, which is a far worse failure than storing an implausible number.

alter table gymapp.weights
  add column grip_kg numeric check (grip_kg is null or grip_kg between 1 and 120),
  add column sit_to_stand int check (sit_to_stand is null or sit_to_stand between 0 and 60),
  add column balance_sec int check (balance_sec is null or balance_sec between 0 and 300);

comment on column gymapp.weights.grip_kg is
  'Best of three squeezes on a hand dynamometer, dominant hand.';
comment on column gymapp.weights.sit_to_stand is
  'Full stands from a chair in 30 seconds, arms crossed.';
comment on column gymapp.weights.balance_sec is
  'Single-leg stand, eyes open, capped at 300 s in the UI.';
