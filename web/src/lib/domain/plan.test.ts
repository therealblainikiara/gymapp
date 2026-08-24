import { describe, expect, it } from "vitest";
import { buildPlan, setsForLevel, todaysPlan, type PlanSettings } from "./plan";
import {
  ALL_EXERCISES,
  ALWAYS_SAFE,
  EXERCISE_DB,
  findExercise,
  MOVEMENT_FLAGS,
  movementFlags,
  MUSCLE_KEYS,
} from "./exercises";
import { removedMovementFlags } from "./conditions";
import { GOALS } from "./goals";
import type { BoneHealth, Goal, InjuryKey } from "@/lib/types/database";

const base: PlanSettings = {
  goal: "general",
  muscles: [],
  level: "intermediate",
  kit: "dbbw",
  session_len: 30,
  avail_days: [1, 3, 5],
  injuries: [],
  menopause_stage: null,
  bone_health: null,
  pelvic_floor: null,
  conditions: [],
  clinician_cleared_at: null,
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

describe("osteoporosis contraindications", () => {
  // The only rule in M6 that *removes* rather than adjusts, so it is the only
  // one where a bug is a safety issue rather than a quality one. Hence the
  // exhaustive sweep rather than a sample.
  const GOAL_KEYS = Object.keys(GOALS) as Goal[];
  const FOCUSES: PlanSettings["muscles"][] = [
    [],
    MUSCLE_KEYS,
    ...MUSCLE_KEYS.map((m) => [m]),
  ];

  function sweep(patch: Partial<PlanSettings>): string[] {
    const names: string[] = [];
    for (const goal of GOAL_KEYS) {
      for (const kit of ["bw", "dbbw"] as const) {
        for (const session_len of [10, 20, 30, 45, 60] as const) {
          for (const muscles of FOCUSES) {
            names.push(
              ...namesIn({ ...base, goal, kit, session_len, muscles, ...patch }),
            );
          }
        }
      }
    }
    return names;
  }

  const banned: ReturnType<typeof movementFlags> = [
    "spinal_flexion",
    "spinal_rotation",
  ];

  it("never prescribes spinal flexion or rotation, in any combination", () => {
    for (const name of sweep({ bone_health: "osteoporosis" })) {
      const flags = movementFlags(findExercise(name)!);
      expect(flags, `${name} was prescribed`).not.toContain("spinal_flexion");
      expect(flags, `${name} was prescribed`).not.toContain("spinal_rotation");
    }
  });

  it("is not a vacuous test — those movements do get prescribed otherwise", () => {
    // If the tagged movements never appeared anyway, the sweep above would
    // pass with the filter deleted.
    const withoutDeclaration = new Set(sweep({}));
    const tagged = ALL_EXERCISES.filter((x) =>
      movementFlags(x).some((f) => banned.includes(f)),
    );
    expect(tagged.length).toBeGreaterThan(0);
    for (const ex of tagged) {
      expect(withoutDeclaration, `${ex.n} never appears`).toContain(ex.n);
    }
  });

  it("fires on the declaration alone, with no clinician clearance", () => {
    // Removals are not behind the gate: refusing to withhold a dangerous
    // movement until a box is ticked would protect us, not the user.
    const names = namesIn({
      ...base,
      muscles: MUSCLE_KEYS,
      bone_health: "osteoporosis",
      clinician_cleared_at: null,
    });
    for (const name of names) {
      expect(movementFlags(findExercise(name)!)).not.toContain("spinal_flexion");
    }
  });

  it("fires only on osteoporosis", () => {
    for (const bone_health of [
      "none",
      "osteopenia",
      "untested",
      null,
    ] as (BoneHealth | null)[]) {
      const names = new Set(sweep({ bone_health }));
      expect(
        [...names].some((n) =>
          movementFlags(findExercise(n)!).includes("spinal_flexion"),
        ),
        `bone_health=${bone_health} should not filter`,
      ).toBe(true);
    }
  });

  it("still returns a usable plan with osteoporosis and every injury flagged", () => {
    const days = buildPlan({
      ...base,
      kit: "bw",
      muscles: MUSCLE_KEYS,
      injuries: ["knee", "shoulder", "back", "wrist"],
      bone_health: "osteoporosis",
    });
    for (const day of days) {
      expect(day.exercises.length).toBeGreaterThan(0);
    }
    for (const name of days.flatMap((d) => d.exercises).map((e) => e.name)) {
      const ex = findExercise(name);
      if (!ex) continue; // finishers are not library movements
      expect(ex.av).toEqual([]);
      expect(movementFlags(ex)).not.toContain("spinal_flexion");
    }
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

  it("uses only known movement flags, with no duplicates", () => {
    for (const ex of ALL_EXERCISES) {
      const flags = movementFlags(ex);
      for (const f of flags) {
        expect(MOVEMENT_FLAGS, `${ex.n} has an unknown flag`).toContain(f);
      }
      expect(new Set(flags).size, `${ex.n} repeats a flag`).toBe(flags.length);
    }
  });

  it("has a last-resort movement that carries no flags at all", () => {
    // `buildPlan` prescribes ALWAYS_SAFE when every filter has emptied a
    // group, so it bypasses `safe()`. If tagging ever leaves the library with
    // nothing clean, that bypass would start handing out an unsafe movement.
    expect(ALWAYS_SAFE.k).toBe("bw");
    expect(ALWAYS_SAFE.av).toEqual([]);
    expect(movementFlags(ALWAYS_SAFE)).toEqual([]);
  });

  it("leaves each muscle group something to prescribe under osteoporosis", () => {
    // Not required for correctness — the fallback covers it — but a group that
    // filters to nothing means the plan quietly stops being about that group.
    const banned = removedMovementFlags({ bone_health: "osteoporosis" });
    for (const key of MUSCLE_KEYS) {
      const left = EXERCISE_DB[key].ex.filter(
        (x) => !movementFlags(x).some((f) => banned.includes(f)),
      );
      expect(left.length, `${key} filters empty`).toBeGreaterThan(0);
    }
  });
});
