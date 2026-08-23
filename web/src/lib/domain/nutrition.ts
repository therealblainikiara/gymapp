import { GOALS } from "./goals";
import type { DietaryKey, Goal } from "@/lib/types/database";

/**
 * Daily targets. Ported from the Mifflin-St Jeor block added in Milestone 1.
 *
 * Falls back to the goal's flat defaults until height, weight and age all
 * exist, and says so in the note rather than presenting a guess as personal.
 */

export interface Targets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  note: string;
  personalised: boolean;
}

/** Activity multiplier and goal adjustment, as tuned in the prototype. */
const GOAL_MULTIPLIER: Record<Goal, number> = {
  fat: 0.8,
  muscle: 1.1,
  strength: 1.1,
  endurance: 1.05,
  general: 1,
};

export function dailyTargets(input: {
  goal: Goal;
  dietary: DietaryKey[];
  heightCm: number | null;
  ageYears: number | null;
  sex: "m" | "f" | null;
  latestKg: number | null;
}): Targets {
  const g = GOALS[input.goal];
  const kcalAdj = input.dietary.includes("veg") ? -100 : 0;

  const h = input.heightCm ?? 0;
  const age = input.ageYears ?? 0;
  const kg = input.latestKg ?? 0;

  if (!(h >= 100 && kg > 0 && age >= 18 && age < 100)) {
    return {
      kcal: g.kcal + kcalAdj,
      protein: g.protein,
      carbs: g.carbs,
      fat: g.fat,
      note: "Goal defaults — add weight, height and age in Progress for personal targets.",
      personalised: false,
    };
  }

  const bmr = 10 * kg + 6.25 * h - 5 * age + (input.sex === "f" ? -161 : 5);
  const mult = GOAL_MULTIPLIER[input.goal] ?? 1;
  const kcal = Math.round((bmr * 1.45 * mult) / 10) * 10 + kcalAdj;
  const protein = Math.round((kg * (input.goal === "fat" ? 1.8 : 1.6)) / 5) * 5;
  const fat = Math.round((kcal * 0.27) / 9 / 5) * 5;
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4 / 5) * 5);

  return {
    kcal,
    protein,
    carbs,
    fat,
    note: `Personalised from ${kg} kg · ${h} cm · age ${age} (Mifflin-St Jeor × moderate activity).`,
    personalised: true,
  };
}

/**
 * BMI and a suggested weight span.
 *
 * The user was explicit: calculate BMI "but not call everyone obese just show
 * suggested weight ranges for their height". There are deliberately no
 * category verdicts here, and the copy frames both numbers as screening
 * information rather than a target.
 */
export function bodyReadout(heightCm: number | null, latestKg: number | null) {
  const h = heightCm ?? 0;
  if (!h || h < 100 || h > 250) {
    return {
      hasBmi: false,
      bmiLine: "",
      rangeLine: "Enter your height to see a suggested weight range.",
    };
  }
  const m2 = (h / 100) * (h / 100);
  const lo = (18.5 * m2).toFixed(0);
  const hi = (24.9 * m2).toFixed(0);
  const rangeLine = `Suggested range for ${h} cm: ${lo}–${hi} kg (a healthy span, not a target — muscle, frame and age all shift it).`;
  if (!latestKg) return { hasBmi: false, bmiLine: "", rangeLine };
  return {
    hasBmi: true,
    bmiLine: `BMI ${(latestKg / m2).toFixed(1)} — a rough screening number only; it can’t tell muscle from fat.`,
    rangeLine,
  };
}
