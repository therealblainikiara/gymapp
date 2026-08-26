import {
  ALWAYS_SAFE,
  BONE_LOADING,
  EXERCISE_DB,
  MUSCLE_KEYS,
  movementFlags,
  type Exercise,
} from "./exercises";
import { removedMovementFlags, type Declarations } from "./conditions";
import { applyRules, type Adjustments } from "./rules";
import { FINISHERS, GOALS } from "./goals";
import { DAY_NAMES } from "./dates";
import type {
  Goal,
  InjuryKey,
  Kit,
  Level,
  MuscleKey,
  SessionLen,
} from "@/lib/types/database";

/**
 * The workout-plan generator, ported from the plan block of `renderVals` in
 * `Gym App v2.dc.html`. The handoff calls for it verbatim, so the selection
 * arithmetic — the exercise budget per session length, the round-robin of
 * muscle groups across available days, the `(di * 2) % list.length` rotation
 * that stops every day opening with the same movement — is reproduced exactly.
 *
 * Filtering is the part that matters most: an exercise whose `av` list contains
 * a flagged joint — or whose mechanics a health declaration rules out — is
 * removed from the pool entirely, and a group left with nothing falls back to
 * core work rather than to an unsafe substitute.
 */

export interface PlanSettings extends Declarations {
  goal: Goal;
  muscles: MuscleKey[];
  level: Level;
  kit: Kit;
  session_len: SessionLen;
  avail_days: number[];
  injuries: InjuryKey[];
}

export interface PlanExercise {
  name: string;
  scheme: string;
  rest: string;
  /** Finishers are not in the exercise library, so they have no detail page. */
  isFinisher: boolean;
  /** Appended by C21's bone rule rather than picked from a muscle group. */
  isBoneLoading?: boolean;
}

export interface PlanDay {
  label: string;
  focus: string;
  exercises: PlanExercise[];
  tip: string;
  /** C21: why this day looks like this, phrased for the user. */
  reasons: string[];
  /** C21: coaching lines that apply to the whole session. */
  notes: string[];
  delay: string;
}

/** Exercises per session, keyed by the minutes the user committed to. */
const BUDGET: Record<number, number> = { 10: 2, 20: 3, 30: 4, 45: 6, 60: 7 };

export function setsForLevel(goal: Goal, level: Level): number {
  const base =
    GOALS[goal].sets + (level === "beginner" ? -1 : level === "advanced" ? 1 : 0);
  return Math.max(2, base);
}

export function scheme(goal: Goal, level: Level): string {
  return `${setsForLevel(goal, level)} × ${GOALS[goal].reps}`;
}

/**
 * Drop anything the user lacks equipment for, that loads a flagged joint, or
 * whose mechanics a health declaration rules out. One filter, three inputs.
 */
function safe(list: Exercise[], settings: PlanSettings): Exercise[] {
  const removed = removedMovementFlags(settings);
  return list.filter(
    (x) =>
      (settings.kit === "dbbw" || x.k === "bw") &&
      !x.av.some((j) => settings.injuries.includes(j)) &&
      !movementFlags(x).some((f) => removed.includes(f)),
  );
}

/**
 * Force at least `adj.minFullBodyDays` of the week's groups to be full body.
 *
 * Written as a change to the *selection* rather than to the day loop so it
 * survives the round-robin below: the loop deals every selected group across
 * the available days, so a group added here becomes a day rather than an extra
 * movement bolted onto one.
 */
export function withFullBodyFloor(
  muscles: MuscleKey[],
  adj: Adjustments,
  dayCount: number,
): MuscleKey[] {
  if (!adj.minFullBodyDays) return muscles;
  const want = Math.min(adj.minFullBodyDays, dayCount);
  const have = muscles.filter((m) => m === "full").length;
  if (have >= want) return muscles;
  return [...muscles, ...Array(want - have).fill("full" as MuscleKey)];
}

export function buildPlan(settings: PlanSettings): PlanDay[] {
  const g = GOALS[settings.goal];
  const sets = setsForLevel(settings.goal, settings.level);
  const adj = applyRules(settings);

  // The rep range and the rest both come from the goal preset unless a rule
  // moved them. `reps` only touches compound work; finishers keep their own.
  const reps = adj.reps ?? g.reps;
  const rest = adj.extraRestSec
    ? `${g.restSec + adj.extraRestSec} s`
    : g.rest;

  // Bone loading is appended to two days a week, and goes through `safe()` like
  // everything else — so a declaration that removes impact empties it, and the
  // two rules never have to know about each other.
  const boneBlock = adj.boneLoading ? safe(BONE_LOADING, settings) : [];

  const pool = {} as Record<MuscleKey, Exercise[]>;
  for (const k of MUSCLE_KEYS) {
    let p = safe(EXERCISE_DB[k].ex, settings);
    if (!p.length) p = safe(EXERCISE_DB.core.ex, settings);
    // Last resort: an empty card teaches the user nothing, so keep one
    // movement even when every filter has fired. `ALWAYS_SAFE` is derived from
    // the library rather than named, so it cannot drift into being unsafe.
    if (!p.length) p = [ALWAYS_SAFE];
    pool[k] = p;
  }

  // Resistance floor: at least two full-body days a week whatever the goal.
  // Everything M6 covers is downstream of losing muscle and bone, and a focus
  // preset is not a reason to train less of the body.
  const sel: MuscleKey[] = withFullBodyFloor(
    settings.muscles.length ? settings.muscles : ["full"],
    adj,
    Math.max(1, settings.avail_days.length),
  );
  const budget = BUDGET[settings.session_len] ?? 4;
  const dayCount = Math.max(1, settings.avail_days.length);

  const groups: MuscleKey[][] = Array.from({ length: dayCount }, () => []);
  sel.forEach((m, i) => groups[i % dayCount].push(m));
  groups.forEach((grp, i) => {
    if (!grp.length) grp.push(sel[i % sel.length]);
  });

  return groups.map((grp, di) => {
    // Bone loading is short but it is still work, and it comes out of the time
    // the user said they had rather than being bolted on top of it.
    const boneDay = di % 2 === 0 && di < 4 && boneBlock.length > 0;
    const dayBudget = Math.max(
      1,
      budget - (boneDay ? boneBlock.length : 0),
    );
    const per = Math.max(1, Math.round(dayBudget / grp.length));
    const exercises: PlanExercise[] = [];

    /**
     * Each movement at most once per day.
     *
     * The old loop indexed the pool with `(offset + k) % list.length` and ran
     * `k` up to `per`, so once the filters shrank a group below the day's
     * count it wrapped and prescribed the same movement again — C33 caught a
     * legs day reading "Glute bridge, Glute bridge, Glute bridge, Glute
     * bridge" and a core day alternating two movements twice. Every unit test
     * passed: they all counted movements and checked flags, and a repeat is
     * both correctly counted and correctly safe.
     */
    const taken = new Set<string>();
    const add = (x: Exercise): boolean => {
      if (taken.has(x.n) || exercises.length >= dayBudget) return false;
      taken.add(x.n);
      exercises.push({
        name: x.n,
        scheme: `${sets} × ${reps}`,
        rest,
        isFinisher: false,
      });
      return true;
    };

    for (const m of grp) {
      const list = pool[m];
      const offset = (di * 2) % list.length;
      // `k < list.length`, not `k < per`: walk the pool at most once round.
      let added = 0;
      for (let k = 0; k < list.length && added < per; k++) {
        if (add(list[(offset + k) % list.length])) added++;
      }
    }

    // Short because the focus pool ran out — fill from everything else that
    // survived `safe()`. A different safe movement is a better session than a
    // repeat, and a shorter one is better than either being padded with lies
    // about how much work it is.
    if (exercises.length < dayBudget) {
      const spare = MUSCLE_KEYS.flatMap((k) => pool[k]);
      // Rotated by day, so a week that leans on the backfill still varies.
      const start = spare.length ? (di * 3) % spare.length : 0;
      for (let k = 0; k < spare.length && exercises.length < dayBudget; k++) {
        add(spare[(start + k) % spare.length]);
      }
    }
    if (g.finisher && settings.session_len >= 20) {
      exercises.push({
        name: FINISHERS[di % FINISHERS.length],
        scheme: "Finisher",
        rest: "—",
        isFinisher: true,
      });
    }

    // Twice a week, not every session: bone needs the stimulus repeated, not
    // constant, and impact every day is how someone ends up with a stress
    // reaction instead of denser bone.
    if (boneDay) {
      for (const x of boneBlock) {
        exercises.push({
          name: x.n,
          scheme: "10 → 50 reps, building weekly",
          rest: "60 s",
          isFinisher: false,
          isBoneLoading: true,
        });
      }
    }
    return {
      label: `${DAY_NAMES[settings.avail_days[di] ?? di]} — DAY 0${di + 1}`,
      focus: grp.map((m) => EXERCISE_DB[m].label).join(" · "),
      exercises,
      tip: g.tips[di % g.tips.length],
      // Every day carries the same reasons: they describe the plan, not the
      // session, and a user landing on Wednesday should not have to find
      // Monday's card to learn why their rep range moved.
      reasons: adj.reasons,
      notes: adj.notes,
      delay: `${(di * 0.07).toFixed(2)}s`,
    };
  });
}

/**
 * Which of the generated days is scheduled for `dow`, or null on a rest day.
 * Mirrors the prototype: count how many training days have already come round
 * this week and index the plan with that.
 */
export function todaysPlan(
  settings: PlanSettings,
  days: PlanDay[],
  dow: number,
): PlanDay | null {
  if (!settings.avail_days.includes(dow) || !days.length) return null;
  const trainIdx = settings.avail_days.filter((x) => x <= dow).length - 1;
  return days[Math.max(0, trainIdx) % days.length];
}

/**
 * M6 / C22 — check-in autoregulation.
 *
 * A night of bad sleep is not a reason to skip the session; it is a reason to
 * do a smaller one. Skipping breaks the streak, and the streak is most of what
 * keeps someone training at 50. So a poor night drops a set and lowers the
 * intensity target, and the day says why.
 *
 * **Not behind the clinician gate**, and not a condition rule. This is ordinary
 * training sense that applies to everyone who checks in, declared or not, and
 * routing it through `conditionProgrammingActive` would make a night of bad
 * sleep matter only to people with a diagnosis.
 *
 * Sleep is the only trigger, per the M6 plan. Energy and stress are collected
 * on the same form and are tempting to fold in, but they move for reasons that
 * have nothing to do with recovery capacity — a stressful week is not a reason
 * to train less, and often the opposite.
 */
export const POOR_SLEEP = 2;

export interface Autoregulation {
  /** Sets removed from every working set this session. */
  setsDropped: number;
  /** Why, phrased for the user. */
  reason: string;
  /** What to do about load. */
  note: string;
}

export function autoregulate(
  checkin: { sleep: number } | null | undefined,
  settings: Pick<PlanSettings, "goal" | "level">,
): Autoregulation | null {
  if (!checkin || checkin.sleep > POOR_SLEEP) return null;
  // `setsForLevel` floors at two, and a session of one set is not a session.
  // Someone already at the floor gets the intensity cut and keeps their sets,
  // which the reason says out loud rather than silently doing nothing.
  const sets = setsForLevel(settings.goal, settings.level);
  const setsDropped = sets > 2 ? 1 : 0;
  return {
    setsDropped,
    reason: setsDropped
      ? "You slept badly, so today is one set lighter. Turning up is the win — the plan is still here tomorrow."
      : "You slept badly. You are already on the minimum sets, so today is the same volume at an easier load.",
    note: "Aim to finish every set with three reps still in the tank. If the first set feels harder than that, drop the weight.",
  };
}

/** Apply autoregulation to one day. Returns the day unchanged when it is null. */
export function autoregulated(
  day: PlanDay,
  a: Autoregulation | null,
): PlanDay {
  if (!a) return day;
  return {
    ...day,
    exercises: day.exercises.map((e) =>
      e.isFinisher || e.isBoneLoading || !a.setsDropped
        ? e
        : { ...e, scheme: dropOneSet(e.scheme) },
    ),
    reasons: [...day.reasons, a.reason],
    notes: [...day.notes, a.note],
  };
}

/**
 * "3 × 8–10" becomes "2 × 8–10". Returns the scheme untouched when it does not
 * parse — a finisher or a bone-loading prescription has no sets to drop, and
 * mangling the string would be worse than leaving it.
 */
export function dropOneSet(scheme: string): string {
  const m = /^(\d+)( × .+)$/.exec(scheme);
  if (!m) return scheme;
  const sets = parseInt(m[1], 10);
  return sets > 1 ? `${sets - 1}${m[2]}` : scheme;
}

export const PREF_TIME_LABELS: Record<string, string> = {
  morning: "07:00",
  lunch: "12:30",
  evening: "18:00",
};
