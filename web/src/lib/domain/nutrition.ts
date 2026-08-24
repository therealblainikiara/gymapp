import { GOALS } from "./goals";
import type { Declarations } from "./conditions";
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
  /** M6 / C24 — micronutrients a declaration brings into play. */
  micros: MicroTarget[];
  /** Why the protein target is where it is, when a rule moved it. */
  proteinNote: string | null;
}

export interface MicroTarget {
  id: string;
  label: string;
  amount: string;
  why: string;
  foods: string[];
}

/**
 * M6 / C24 — the micronutrient targets a declaration brings into play.
 *
 * **Food first, and supplements are a clinician's call.** Calcium and vitamin D
 * are the two places where "just take a supplement" is genuinely risky —
 * calcium interacts with several common medications and is contraindicated in
 * hypercalcaemia and some kidney disease. So the targets are stated with the
 * foods that reach them and an explicit line about supplementing, rather than a
 * dose to go and buy.
 *
 * Ungated, consistently with C23: these are public-health figures anyone can
 * look up, and withholding them from someone who declared osteoporosis until
 * they tick a box would leave them with less information than a leaflet.
 */
const MICROS: Record<string, MicroTarget> = {
  calcium: {
    id: "calcium",
    label: "Calcium",
    amount: "1200 mg/day",
    why: "Bone turnover accelerates when oestrogen falls, and calcium is the raw material. The target is higher than the general adult 700 mg.",
    foods: [
      "Milk or fortified plant milk — 300 mg a glass",
      "Hard cheese — 200 mg a matchbox",
      "Tinned sardines with bones — 400 mg a tin",
      "Kale, pak choi, fortified tofu",
    ],
  },
  vitamin_d: {
    id: "vitamin_d",
    label: "Vitamin D",
    amount: "10 µg / 400 IU a day, autumn to spring",
    why: "Calcium is no use unabsorbed, and that is what vitamin D does. Skin synthesis is negligible in winter at UK and southern-Australian latitudes.",
    foods: [
      "Oily fish — salmon, mackerel, sardines",
      "Egg yolks",
      "Fortified spreads and cereals",
      "Sunlight on forearms, 10–15 min most days in summer",
    ],
  },
  iron: {
    id: "iron",
    label: "Iron — worth checking",
    amount: "Ask for a ferritin test, not a supplement",
    why: "Perimenopausal bleeding is often heavier and less predictable, and low ferritin shows up as training fatigue long before anaemia does. Iron is the one micronutrient where guessing is actively harmful — too much is toxic and the symptoms of low and high overlap.",
    foods: [
      "Red meat, liver, sardines",
      "Lentils, beans, fortified cereal",
      "Vitamin C alongside plant sources doubles absorption",
      "Tea and coffee with a meal halve it — move them an hour either side",
    ],
  },
};

/**
 * Which micronutrient targets this profile should see.
 *
 * Driven by the declaration rather than by age, per rule 1 of M6.
 */
export function microsFor(
  d: Pick<Declarations, "menopause_stage" | "bone_health">,
): MicroTarget[] {
  const menopausal = d.menopause_stage === "peri" || d.menopause_stage === "post";
  const lowBone =
    d.bone_health === "osteopenia" || d.bone_health === "osteoporosis";
  const out: MicroTarget[] = [];
  if (menopausal || lowBone) out.push(MICROS.calcium, MICROS.vitamin_d);
  // Perimenopause only. After the last period the loss stops and iron needs
  // fall to the same as anyone else's — carrying the flag forward would have
  // people supplementing iron they no longer lose.
  if (d.menopause_stage === "peri") out.push(MICROS.iron);
  return out;
}

/**
 * Grams of protein per kg, and why.
 *
 * The M6 plan says "1.6 → 2.0 g/kg for 45+". Driving that off age is wrong on
 * two counts, and the chunk's own accept criterion catches it: the existing
 * Mifflin-St Jeor fixture is a 47-year-old expecting 135 g, and it is required
 * to pass unchanged. It also contradicts rule 1 — no variation gated on age
 * alone.
 *
 * So the raise is driven by the declaration instead, which is better evidence
 * anyway. 1.6 g/kg is already the over-40s baseline this app has always used —
 * twice the general population figure. The step to 2.0 is the response to
 * muscle and bone loss accelerating, and the declaration is what marks that,
 * not a birthday.
 */
export function proteinPerKg(
  goal: Goal,
  d: Pick<Declarations, "menopause_stage" | "bone_health">,
): { perKg: number; note: string | null } {
  const menopausal = d.menopause_stage === "peri" || d.menopause_stage === "post";
  const lowBone =
    d.bone_health === "osteopenia" || d.bone_health === "osteoporosis";
  if (menopausal || lowBone) {
    return {
      perKg: 2.0,
      note: "Protein raised to 2.0 g/kg — muscle needs a bigger signal to build once oestrogen falls, and bone is a protein scaffold before it is a mineral one. Spread it across the day; 30 g a meal beats 90 g at dinner.",
    };
  }
  return { perKg: goal === "fat" ? 1.8 : 1.6, note: null };
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
  /** Optional so every existing caller and test keeps working untouched. */
  declarations?: Pick<Declarations, "menopause_stage" | "bone_health">;
}): Targets {
  const g = GOALS[input.goal];
  const kcalAdj = input.dietary.includes("veg") ? -100 : 0;
  const d = input.declarations ?? {
    menopause_stage: null,
    bone_health: null,
  };
  const micros = microsFor(d);
  const { perKg, note: proteinNote } = proteinPerKg(input.goal, d);

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
      micros,
      proteinNote: null,
    };
  }

  const bmr = 10 * kg + 6.25 * h - 5 * age + (input.sex === "f" ? -161 : 5);
  const mult = GOAL_MULTIPLIER[input.goal] ?? 1;
  const kcal = Math.round((bmr * 1.45 * mult) / 10) * 10 + kcalAdj;
  const protein = Math.round((kg * perKg) / 5) * 5;
  const fat = Math.round((kcal * 0.27) / 9 / 5) * 5;
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4 / 5) * 5);

  return {
    kcal,
    protein,
    carbs,
    fat,
    note: `Personalised from ${kg} kg · ${h} cm · age ${age} (Mifflin-St Jeor × moderate activity).`,
    personalised: true,
    micros,
    proteinNote,
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
