import { describe, expect, it } from "vitest";
import { buildPlan, setsForLevel, todaysPlan, type PlanSettings } from "./plan";
import { EXERCISE_DB, findExercise, MUSCLE_KEYS } from "./exercises";
import type { InjuryKey } from "@/lib/types/database";

const base: PlanSettings = {
  goal: "general",
  muscles: [],
  level: "intermediate",
  kit: "dbbw",
  session_len: 30,
  avail_days: [1, 3, 5],
  injuries: [],
};

function namesIn(settings: PlanSettings): string[] {
  return buildPlan(settings)
    .flatMap((d) => d.exercises)
    .filter((e) => !e.isFinisher)
    .map((e) => e.name);
}

describe("plan generation", () => {
  it("makes one day per available training day", () => {
    expect(buildPlan({ ...base, avail_days: [0, 2, 4, 6] })).toHaveLength(4);
    expect(buildPlan({ ...base, avail_days: [1] })).toHaveLength(1);
  });

  it("still produces a day when no days are selected", () => {
    // A plan with zero days would render an empty Train screen; the generator
    // falls back to one rather than nothing.
    expect(buildPlan({ ...base, avail_days: [] })).toHaveLength(1);
  });

  it("scales the exercise count to the time the user committed to", () => {
    const counts = ([10, 20, 30, 45, 60] as const).map(
      (session_len) =>
        buildPlan({ ...base, session_len, avail_days: [1] })[0].exercises.filter(
          (e) => !e.isFinisher,
        ).length,
    );
    expect(counts).toEqual([2, 3, 4, 6, 7]);
  });

  it("adjusts sets by level and never drops below two", () => {
    expect(setsForLevel("general", "beginner")).toBe(2);
    expect(setsForLevel("general", "intermediate")).toBe(3);
    expect(setsForLevel("general", "advanced")).toBe(4);
    // strength starts at 4, so a beginner lands on 3 — the floor only bites
    // for goals that start at 3.
    expect(setsForLevel("strength", "beginner")).toBe(3);
  });

  it("adds a finisher only for goals that ask for one, and not at 10 minutes", () => {
    const hasFinisher = (s: PlanSettings) =>
      buildPlan(s).some((d) => d.exercises.some((e) => e.isFinisher));
    expect(hasFinisher({ ...base, goal: "fat" })).toBe(true);
    expect(hasFinisher({ ...base, goal: "endurance" })).toBe(true);
    expect(hasFinisher({ ...base, goal: "general" })).toBe(false);
    expect(hasFinisher({ ...base, goal: "fat", session_len: 10 })).toBe(false);
  });

  it("offers only bodyweight movements when there are no dumbbells", () => {
    for (const name of namesIn({ ...base, kit: "bw", muscles: MUSCLE_KEYS })) {
      expect(findExercise(name)?.k).toBe("bw");
    }
  });
});

describe("injury filtering", () => {
  // This is the safety-critical rule: a flagged joint must never appear in a
  // plan, for any combination of goal, kit, length and focus.
  const injuries: InjuryKey[] = ["knee", "shoulder", "back", "wrist"];

  for (const injury of injuries) {
    it(`never prescribes a movement that loads the ${injury}`, () => {
      for (const kit of ["bw", "dbbw"] as const) {
        for (const session_len of [10, 20, 30, 45, 60] as const) {
          const names = namesIn({
            ...base,
            kit,
            session_len,
            muscles: MUSCLE_KEYS,
            injuries: [injury],
          });
          for (const name of names) {
            expect(
              findExercise(name)?.av,
              `${name} loads the ${injury} but was prescribed`,
            ).not.toContain(injury);
          }
        }
      }
    });
  }

  it("holds when every injury is flagged at once", () => {
    const names = namesIn({
      ...base,
      kit: "bw",
      muscles: MUSCLE_KEYS,
      injuries,
    });
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(findExercise(name)?.av).toEqual([]);
    }
  });

  it("returns a usable plan even when a muscle group is filtered empty", () => {
    // Bodyweight + wrist injury guts the chest group; the day must still have
    // something safe in it rather than being blank.
    const days = buildPlan({
      ...base,
      kit: "bw",
      muscles: ["chest"],
      injuries: ["wrist"],
      avail_days: [1],
    });
    expect(days[0].exercises.length).toBeGreaterThan(0);
  });
});

describe("today's session", () => {
  const settings = { ...base, avail_days: [1, 3, 5] };
  const days = buildPlan(settings);

  it("is null on a scheduled rest day", () => {
    for (const dow of [0, 2, 4, 6]) {
      expect(todaysPlan(settings, days, dow)).toBeNull();
    }
  });

  it("walks the plan in order across the week", () => {
    expect(todaysPlan(settings, days, 1)).toBe(days[0]);
    expect(todaysPlan(settings, days, 3)).toBe(days[1]);
    expect(todaysPlan(settings, days, 5)).toBe(days[2]);
  });
});

describe("exercise library", () => {
  it("has no duplicate exercise names across groups", () => {
    const all = MUSCLE_KEYS.flatMap((k) => EXERCISE_DB[k].ex.map((e) => e.n));
    expect(new Set(all).size).toBe(all.length);
  });

  it("gives every exercise cues, a safety note and both variations", () => {
    for (const key of MUSCLE_KEYS) {
      for (const ex of EXERCISE_DB[key].ex) {
        expect(ex.c.length, `${ex.n} cues`).toBeGreaterThan(0);
        expect(ex.s, `${ex.n} safety note`).toBeTruthy();
        expect(ex.e, `${ex.n} easier variation`).toBeTruthy();
        expect(ex.h, `${ex.n} harder variation`).toBeTruthy();
      }
    }
  });
});
