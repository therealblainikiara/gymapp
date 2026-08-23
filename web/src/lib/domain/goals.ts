import type { Goal } from "@/lib/types/database";

/**
 * Goal presets, ported verbatim from the `GOALS` object in the prototype.
 * Sets, reps, rests, the split name and the fallback macro targets are all
 * drafted from whichever goal the user picked in intake.
 */
export interface GoalSpec {
  label: string;
  desc: string;
  sets: number;
  reps: string;
  rest: string;
  restSec: number;
  finisher?: boolean;
  split: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  tips: string[];
}

export const GOALS: Record<Goal, GoalSpec> = {
  muscle: {
    label: "Build muscle",
    desc: "Moderate reps, controlled tempo",
    sets: 3,
    reps: "8–10",
    rest: "90 s",
    restSec: 90,
    split: "Hypertrophy split",
    kcal: 2600,
    protein: 150,
    carbs: 290,
    fat: 80,
    tips: [
      "Leave 1–2 reps in the tank — every set.",
      "Add a rep or a little load each week.",
      "Own the lowering phase: 2–3 s down.",
      "Two easy warm-up rounds first. Always.",
    ],
  },
  fat: {
    label: "Lose fat",
    desc: "Higher reps, short rests, finishers",
    sets: 3,
    reps: "12–15",
    rest: "45 s",
    restSec: 45,
    finisher: true,
    split: "Circuit split",
    kcal: 1900,
    protein: 150,
    carbs: 170,
    fat: 60,
    tips: [
      "Keep rests honest — use a timer.",
      "Walk 8–10k steps on top of sessions.",
      "Protein at every meal keeps you full.",
      "Push the last set close to failure.",
    ],
  },
  strength: {
    label: "Strength",
    desc: "Heavier work, low reps, long rests",
    sets: 4,
    reps: "6",
    rest: "120 s",
    restSec: 120,
    split: "Strength split",
    kcal: 2700,
    protein: 155,
    carbs: 300,
    fat: 85,
    tips: [
      "Brace before every rep — like a light cough.",
      "Stop a set when the speed grinds.",
      "Log the top set. Progress is the plan.",
      "Technique first, load second.",
    ],
  },
  endurance: {
    label: "Endurance",
    desc: "High reps, minimal rest",
    sets: 3,
    reps: "15–20",
    rest: "30 s",
    restSec: 30,
    finisher: true,
    split: "Endurance split",
    kcal: 2400,
    protein: 125,
    carbs: 310,
    fat: 70,
    tips: [
      "Move continuously — rest is a slow walk.",
      "Keep loads light and form crisp.",
      "Hydrate before, during, after.",
      "Finish with 5 min easy cooldown.",
    ],
  },
  general: {
    label: "General fitness",
    desc: "Balanced strength + conditioning",
    sets: 3,
    reps: "10–12",
    rest: "60 s",
    restSec: 60,
    split: "Balanced split",
    kcal: 2300,
    protein: 130,
    carbs: 250,
    fat: 75,
    tips: [
      "Consistency beats intensity. Show up.",
      "Leave feeling better, not broken.",
      "Stretch what you trained — 5 min.",
      "Sleep is your best recovery tool.",
    ],
  },
};

export const GOAL_KEYS = Object.keys(GOALS) as Goal[];

export const FINISHERS = [
  "March-in-place intervals — 4 × 1 min brisk / 30 s easy",
  "Dumbbell swings — 3 × 15, light bell",
  "Step-up ladder — 3 min steady",
  "Shadow-box — 3 × 1 min",
  "Farmer’s carry — 4 × 30 m",
];
