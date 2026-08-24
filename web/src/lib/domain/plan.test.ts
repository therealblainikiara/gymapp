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
  isBoneLoading,
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

describe("C21 — the rules reach the plan", () => {
  const CLEARED = "2026-08-24T10:00:00Z";
  const declaring = (patch: Partial<PlanSettings>): PlanSettings => ({
    ...base,
    muscles: MUSCLE_KEYS,
    clinician_cleared_at: CLEARED,
    ...patch,
  });

  it("appends bone loading twice a week, and only for low bone density", () => {
    const days = buildPlan(declaring({ bone_health: "osteopenia" }));
    const withBone = days.filter((d) =>
      d.exercises.some((e) => e.isBoneLoading),
    );
    expect(withBone).toHaveLength(2);
    expect(
      buildPlan(declaring({ bone_health: "none" })).flatMap((d) =>
        d.exercises.filter((e) => e.isBoneLoading),
      ),
    ).toEqual([]);
  });

  it("keeps bone loading out until a clinician has been in the loop", () => {
    const days = buildPlan(
      declaring({ bone_health: "osteopenia", clinician_cleared_at: null }),
    );
    expect(days.flatMap((d) => d.exercises.filter((e) => e.isBoneLoading)))
      .toEqual([]);
  });

  it("moves the compound rep range for peri and post menopause", () => {
    const before = buildPlan(base)[0].exercises[0].scheme;
    const after = buildPlan(declaring({ menopause_stage: "peri" }))[0]
      .exercises[0].scheme;
    expect(after).toContain("6–8");
    expect(after).not.toBe(before);
  });

  it("lengthens every rest for declared hypertension", () => {
    const days = buildPlan(declaring({ conditions: ["hypertension"] }));
    for (const e of days.flatMap((d) => d.exercises)) {
      if (e.isFinisher) continue;
      expect(e.rest, e.name).toBe("90 s"); // general: 60 s + 30
    }
  });

  it("carries the reasons onto every day, not just the first", () => {
    // A user landing on Wednesday should not have to find Monday's card to
    // learn why their rep range moved.
    const days = buildPlan(declaring({ menopause_stage: "peri" }));
    expect(days.length).toBeGreaterThan(1);
    for (const d of days) {
      expect(d.reasons.join(" "), d.label).toContain("perimenopausal");
    }
  });

  it("gives a plain plan no reasons and no notes", () => {
    for (const d of buildPlan(base)) {
      expect(d.reasons).toEqual([]);
      expect(d.notes).toEqual([]);
    }
  });

  it("holds the resistance floor at two full-body days", () => {
    const days = buildPlan(
      declaring({ muscles: ["arms"], bone_health: "osteopenia" }),
    );
    const fullBody = days.filter((d) => d.focus.includes("Full body"));
    expect(fullBody.length).toBeGreaterThanOrEqual(2);
  });

  it("never prescribes a removed mechanic, for any declaration or goal", () => {
    // The C20 sweep widened to every rule that removes.
    const patches: Partial<PlanSettings>[] = [
      { bone_health: "osteoporosis" },
      { pelvic_floor: "diagnosed" },
      { conditions: ["frozen_shoulder"] },
      { conditions: ["oa_knee"] },
      { conditions: ["hypertension"] },
      {
        bone_health: "osteoporosis",
        pelvic_floor: "diagnosed",
        conditions: ["frozen_shoulder", "oa_knee", "hypertension"],
      },
    ];
    for (const patch of patches) {
      for (const goal of Object.keys(GOALS) as Goal[]) {
        for (const kit of ["bw", "dbbw"] as const) {
          for (const session_len of [10, 30, 60] as const) {
            const s = declaring({ ...patch, goal, kit, session_len });
            const banned = removedMovementFlags(s);
            const days = buildPlan(s);
            expect(days.flatMap((d) => d.exercises).length).toBeGreaterThan(0);
            for (const e of days.flatMap((d) => d.exercises)) {
              if (e.isFinisher) continue;
              const ex = findExercise(e.name);
              for (const f of movementFlags(ex!)) {
                expect(banned, `${e.name} despite ${f}`).not.toContain(f);
              }
            }
          }
        }
      }
    }
  });

  it("does not prescribe impact to someone whose pelvic floor rules it out", () => {
    // The composition case: one rule appends impact, another removes it. The
    // block empties itself through `safe()` rather than by the rules knowing
    // about each other.
    const days = buildPlan(
      declaring({ bone_health: "osteoporosis", pelvic_floor: "diagnosed" }),
    );
    expect(days.flatMap((d) => d.exercises.filter((e) => e.isBoneLoading)))
      .toEqual([]);
    expect(days[0].reasons.join(" ")).toContain("pelvic floor");
  });

  it("gives every bone-loading movement a detail page", () => {
    const days = buildPlan(declaring({ bone_health: "osteopenia" }));
    for (const e of days.flatMap((d) =>
      d.exercises.filter((x) => x.isBoneLoading),
    )) {
      const ex = findExercise(e.name);
      expect(ex, e.name).toBeTruthy();
      expect(ex!.c.length).toBeGreaterThan(0);
      expect(ex!.s).toBeTruthy();
    }
  });

  it("keeps bone-loading movements out of ordinary plans", () => {
    // They live outside EXERCISE_DB so the muscle rotation can never draw them
    // in — impact work must be prescribed by the rule that asked for it.
    for (const goal of Object.keys(GOALS) as Goal[]) {
      const names = namesIn({ ...base, goal, muscles: MUSCLE_KEYS });
      for (const n of names) expect(isBoneLoading(n), n).toBe(false);
    }
  });
});
