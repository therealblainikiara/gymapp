import type { DietaryKey } from "@/lib/types/database";

/**
 * Meal library, ported verbatim from `MEALS` in the prototype.
 *
 * `veg`/`lf`/`gf`/`nf` are compliance flags, not preferences. The user was
 * explicit: "lactose free, gluten free etc … are not just choices they are
 * health requirements". A meal that does not carry the flag is REMOVED from
 * the list, never merely ranked lower — see `mealsForDay`.
 */
export interface Meal {
  name: string;
  desc: string;
  kcal: number;
  protein: number;
  veg: boolean;
  lf: boolean;
  gf: boolean;
  nf: boolean;
  /** anti-inflammatory tag */
  ai: boolean;
  ing: string[];
  prep: string[];
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_SLOTS: MealSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

export const MEALS: Record<MealSlot, Meal[]> = {
  breakfast: [
    {
      name: "Protein oats",
      desc: "GF-certified oats, whey, banana, walnuts.",
      kcal: 550,
      protein: 38,
      veg: true,
      lf: false,
      gf: true,
      nf: false,
      ai: true,
      ing: ["GF rolled oats", "Whey protein", "Bananas", "Walnuts"],
      prep: [
        "Simmer oats in milk 4 min",
        "Stir in whey off the heat",
        "Top with banana + walnuts",
      ],
    },
    {
      name: "Greek yogurt bowl",
      desc: "Thick yogurt, berries, granola, honey.",
      kcal: 420,
      protein: 32,
      veg: true,
      lf: false,
      gf: false,
      nf: true,
      ai: true,
      ing: ["Greek yogurt", "Mixed berries", "Granola", "Honey"],
      prep: ["Spoon yogurt into a bowl", "Add berries + granola", "Drizzle honey"],
    },
    {
      name: "Eggs on sourdough",
      desc: "Three eggs, smashed avocado, chilli.",
      kcal: 520,
      protein: 28,
      veg: true,
      lf: true,
      gf: false,
      nf: true,
      ai: false,
      ing: ["Eggs", "Sourdough", "Avocado", "Chilli flakes"],
      prep: [
        "Toast the sourdough",
        "Scramble eggs low + slow",
        "Smash avocado on top",
      ],
    },
    {
      name: "Tofu scramble & greens",
      desc: "Turmeric tofu, spinach, GF toast.",
      kcal: 440,
      protein: 26,
      veg: true,
      lf: true,
      gf: true,
      nf: true,
      ai: true,
      ing: ["Firm tofu", "Spinach", "Turmeric", "GF bread"],
      prep: [
        "Crumble tofu into a hot pan",
        "Season with turmeric + pepper",
        "Wilt spinach through",
      ],
    },
  ],
  lunch: [
    {
      name: "Chicken burrito bowl",
      desc: "Rice, black beans, salsa, corn, lime.",
      kcal: 650,
      protein: 45,
      veg: false,
      lf: true,
      gf: true,
      nf: true,
      ai: false,
      ing: ["Chicken breast", "Rice", "Black beans", "Salsa", "Corn", "Limes"],
      prep: [
        "Grill seasoned chicken 6 min/side",
        "Bowl rice + beans + corn",
        "Slice chicken, salsa, lime",
      ],
    },
    {
      name: "Tofu poke bowl",
      desc: "Tamari tofu, sushi rice, edamame, mango.",
      kcal: 580,
      protein: 30,
      veg: true,
      lf: true,
      gf: true,
      nf: true,
      ai: true,
      ing: ["Firm tofu", "Sushi rice", "Edamame", "Tamari (GF)", "Mango"],
      prep: [
        "Cube + marinate tofu 10 min",
        "Cook rice, cool slightly",
        "Assemble with edamame + mango",
      ],
    },
    {
      name: "Turkey club wrap",
      desc: "Turkey, lettuce, tomato, wholegrain wrap.",
      kcal: 560,
      protein: 40,
      veg: false,
      lf: true,
      gf: false,
      nf: true,
      ai: false,
      ing: ["Turkey slices", "Wholegrain wraps", "Lettuce", "Tomatoes"],
      prep: [
        "Lay fillings on the wrap",
        "Roll tight, tuck the ends",
        "Halve on the diagonal",
      ],
    },
    {
      name: "Lentil & halloumi salad",
      desc: "Warm lentils, grilled halloumi, rocket.",
      kcal: 540,
      protein: 28,
      veg: true,
      lf: false,
      gf: true,
      nf: true,
      ai: true,
      ing: ["Lentils", "Halloumi", "Rocket", "Lemon", "Olive oil"],
      prep: [
        "Warm lentils with olive oil",
        "Grill halloumi 2 min/side",
        "Toss with rocket + lemon",
      ],
    },
  ],
  dinner: [
    {
      name: "Salmon & quinoa",
      desc: "Baked salmon, quinoa, charred broccoli.",
      kcal: 640,
      protein: 42,
      veg: false,
      lf: true,
      gf: true,
      nf: true,
      ai: true,
      ing: ["Salmon fillets", "Quinoa", "Broccoli", "Lemon"],
      prep: [
        "Bake salmon 12 min at 200°",
        "Simmer quinoa 15 min",
        "Char broccoli in a hot pan",
      ],
    },
    {
      name: "Steak & sweet potato",
      desc: "Sirloin, roast sweet potato, greens.",
      kcal: 700,
      protein: 48,
      veg: false,
      lf: true,
      gf: true,
      nf: true,
      ai: false,
      ing: ["Sirloin steak", "Sweet potatoes", "Green beans"],
      prep: [
        "Roast sweet potato 30 min",
        "Pan-sear steak, rest 5 min",
        "Steam the greens",
      ],
    },
    {
      name: "Paneer tikka & rice",
      desc: "Charred paneer, basmati, raita.",
      kcal: 620,
      protein: 32,
      veg: true,
      lf: false,
      gf: true,
      nf: true,
      ai: true,
      ing: ["Paneer", "Basmati rice", "Yogurt", "Tikka paste", "Cucumber"],
      prep: [
        "Coat paneer in tikka + yogurt",
        "Grill until charred",
        "Serve on rice with raita",
      ],
    },
    {
      name: "Chickpea spinach curry",
      desc: "Coconut base, brown rice, coriander.",
      kcal: 560,
      protein: 24,
      veg: true,
      lf: true,
      gf: true,
      nf: true,
      ai: true,
      ing: ["Chickpeas", "Spinach", "Coconut milk", "Brown rice", "Curry paste"],
      prep: [
        "Fry paste, add coconut milk",
        "Simmer chickpeas 10 min",
        "Wilt spinach, serve on rice",
      ],
    },
  ],
  snack: [
    {
      name: "Protein shake & almonds",
      desc: "One scoop whey, a handful of almonds.",
      kcal: 300,
      protein: 30,
      veg: true,
      lf: false,
      gf: true,
      nf: false,
      ai: true,
      ing: ["Whey protein", "Almonds", "Milk"],
      prep: ["Shake whey with milk", "Count out ~20 almonds"],
    },
    {
      name: "Cottage cheese & pineapple",
      desc: "High-protein, post-session friendly.",
      kcal: 220,
      protein: 24,
      veg: true,
      lf: false,
      gf: true,
      nf: true,
      ai: false,
      ing: ["Cottage cheese", "Pineapple"],
      prep: ["Spoon cottage cheese", "Top with pineapple chunks"],
    },
    {
      name: "Beef jerky & apple",
      desc: "Portable protein plus quick carbs.",
      kcal: 250,
      protein: 26,
      veg: false,
      lf: true,
      gf: true,
      nf: true,
      ai: false,
      ing: ["Beef jerky", "Apples"],
      prep: ["Pack it. Eat it."],
    },
    {
      name: "Hummus & veggie sticks",
      desc: "Carrot, cucumber, pepper, hummus.",
      kcal: 200,
      protein: 8,
      veg: true,
      lf: true,
      gf: true,
      nf: true,
      ai: true,
      ing: ["Hummus", "Carrots", "Cucumber", "Peppers"],
      prep: ["Cut veg into batons", "Dip generously"],
    },
  ],
};

export const DIETARY: ReadonlyArray<readonly [DietaryKey, string]> = [
  ["veg", "Vegetarian"],
  ["lf", "Lactose-free"],
  ["gf", "Gluten-free"],
  ["nf", "Nut-free"],
];

export const REQ_NAMES: Record<DietaryKey, string> = {
  veg: "VEG",
  lf: "LACTOSE-FREE",
  gf: "GLUTEN-FREE",
  nf: "NUT-FREE",
};

export function dietaryLabel(id: DietaryKey): string {
  return DIETARY.find(([k]) => k === id)?.[1] ?? id;
}

export interface PlannedMeal extends Meal {
  id: MealSlot;
  slot: string;
  delay: string;
  prepSteps: { n: number; t: string }[];
  reqTags: DietaryKey[];
  /** True when no meal in the slot satisfies every requirement. */
  unfiltered: boolean;
}

/**
 * Pick today's four meals.
 *
 * Dietary requirements are hard filters. The prototype fell back to the
 * unfiltered list when a slot had no compliant option; that fallback is kept
 * so the screen never renders empty, but the meal is flagged so the UI can say
 * out loud that it does not meet the requirements rather than implying it does.
 */
export function mealsForDay(
  dietary: DietaryKey[],
  mealIdx: Partial<Record<MealSlot, number>>,
): PlannedMeal[] {
  return MEAL_SLOTS.map((slot, i) => {
    const compliant = MEALS[slot].filter((o) => dietary.every((r) => o[r]));
    const unfiltered = compliant.length === 0;
    const opts = unfiltered ? MEALS[slot] : compliant;
    const pick = opts[(mealIdx[slot] ?? 0) % opts.length];
    return {
      ...pick,
      id: slot,
      slot: slot.toUpperCase(),
      delay: `${(i * 0.06).toFixed(2)}s`,
      prepSteps: pick.prep.map((t, j) => ({ n: j + 1, t })),
      reqTags: (["veg", "lf", "gf", "nf"] as DietaryKey[]).filter(
        (r) => pick[r],
      ),
      unfiltered,
    };
  });
}

/** De-duplicated ingredient list across today's four meals. */
export function groceryList(meals: PlannedMeal[]): string[] {
  const out: string[] = [];
  for (const m of meals) {
    for (const item of m.ing) if (!out.includes(item)) out.push(item);
  }
  return out;
}
