import { describe, expect, it } from "vitest";
import { groceryList, MEAL_SLOTS, MEALS, mealsForDay } from "./meals";
import type { DietaryKey } from "@/lib/types/database";

/** Every subset of the four requirements. */
function allCombinations(): DietaryKey[][] {
  const keys: DietaryKey[] = ["veg", "lf", "gf", "nf"];
  const out: DietaryKey[][] = [];
  for (let mask = 0; mask < 1 << keys.length; mask++) {
    out.push(keys.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

describe("dietary requirements are hard filters", () => {
  // The user's words: these "are not just choices they are health
  // requirements". A nut-free user shown a meal with almonds in it is the
  // worst failure this app can have, so every combination is checked.
  it.each(allCombinations().map((c) => [c.join(",") || "(none)", c] as const))(
    "%s — every returned meal either complies or is flagged as non-compliant",
    (_label, dietary) => {
      const meals = mealsForDay(dietary, {});
      expect(meals).toHaveLength(4);
      for (const meal of meals) {
        const complies = dietary.every((r) => meal[r]);
        if (!complies) {
          // The only acceptable non-compliant meal is one the UI has been told
          // to warn about, and only when the slot genuinely has no option.
          expect(meal.unfiltered).toBe(true);
        }
      }
    },
  );

  it("has a compliant option in every slot for every combination", () => {
    // If this ever fails the fallback above kicks in and the user sees a
    // warning — correct, but a content gap worth knowing about.
    for (const dietary of allCombinations()) {
      for (const meal of mealsForDay(dietary, {})) {
        expect(
          meal.unfiltered,
          `no ${meal.id} option satisfies ${dietary.join("+") || "no requirements"}`,
        ).toBe(false);
      }
    }
  });

  it("cycles through compliant options only when swapping", () => {
    const dietary: DietaryKey[] = ["gf", "nf"];
    for (let i = 0; i < 12; i++) {
      const [breakfast] = mealsForDay(dietary, { breakfast: i });
      expect(breakfast.gf && breakfast.nf).toBe(true);
    }
  });

  it("wraps around rather than running out of meals to swap to", () => {
    const first = mealsForDay([], { lunch: 0 })[1].name;
    const wrapped = mealsForDay([], { lunch: MEALS.lunch.length })[1].name;
    expect(wrapped).toBe(first);
  });

  it("tags each meal with exactly the requirements it satisfies", () => {
    for (const meal of mealsForDay([], {})) {
      for (const key of ["veg", "lf", "gf", "nf"] as DietaryKey[]) {
        expect(meal.reqTags.includes(key)).toBe(meal[key]);
      }
    }
  });
});

describe("grocery list", () => {
  it("de-duplicates ingredients shared between meals", () => {
    const meals = mealsForDay(["veg", "lf", "gf", "nf"], {});
    const list = groceryList(meals);
    expect(new Set(list).size).toBe(list.length);
    const total = meals.reduce((n, m) => n + m.ing.length, 0);
    expect(list.length).toBeLessThanOrEqual(total);
  });

  it("covers every ingredient of the chosen meals", () => {
    const meals = mealsForDay([], {});
    const list = new Set(groceryList(meals));
    for (const meal of meals) {
      for (const ing of meal.ing) expect(list.has(ing)).toBe(true);
    }
  });
});

describe("meal library", () => {
  it("gives every meal prep steps and ingredients", () => {
    for (const slot of MEAL_SLOTS) {
      for (const meal of MEALS[slot]) {
        expect(meal.ing.length, `${meal.name} ingredients`).toBeGreaterThan(0);
        expect(meal.prep.length, `${meal.name} prep`).toBeGreaterThan(0);
      }
    }
  });
});
