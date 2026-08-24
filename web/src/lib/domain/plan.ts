import {
  ALWAYS_SAFE,
  EXERCISE_DB,
  MUSCLE_KEYS,
  movementFlags,
  type Exercise,
} from "./exercises";
import { removedMovementFlags, type Declarations } from "./conditions";
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
}

export interface PlanDay {
  label: string;
  focus: string;
  exercises: PlanExercise[];
  tip: string;
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

export function buildPlan(settings: PlanSettings): PlanDay[] {
  const g = GOALS[settings.goal];
  const sets = setsForLevel(settings.goal, settings.level);

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

  const sel: MuscleKey[] = settings.muscles.length ? settings.muscles : ["full"];
  const budget = BUDGET[settings.session_len] ?? 4;
  const dayCount = Math.max(1, settings.avail_days.length);

  const groups: MuscleKey[][] = Array.from({ length: dayCount }, () => []);
  sel.forEach((m, i) => groups[i % dayCount].push(m));
  groups.forEach((grp, i) => {
    if (!grp.length) grp.push(sel[i % sel.length]);
  });

  return groups.map((grp, di) => {
    const per = Math.max(1, Math.round(budget / grp.length));
    const exercises: PlanExercise[] = [];
    for (const m of grp) {
      const list = pool[m];
      const offset = (di * 2) % list.length;
      for (let k = 0; k < per && exercises.length < budget; k++) {
        exercises.push({
          name: list[(offset + k) % list.length].n,
          scheme: `${sets} × ${g.reps}`,
          rest: g.rest,
          isFinisher: false,
        });
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
    return {
      label: `${DAY_NAMES[settings.avail_days[di] ?? di]} — DAY 0${di + 1}`,
      focus: grp.map((m) => EXERCISE_DB[m].label).join(" · "),
      exercises,
      tip: g.tips[di % g.tips.length],
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

export const PREF_TIME_LABELS: Record<string, string> = {
  morning: "07:00",
  lunch: "12:30",
  evening: "18:00",
};
