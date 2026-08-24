import { describe, expect, it } from "vitest";
import {
  BREATHING_MOVE,
  LYMPH,
  MILESTONES,
  RECOVERY_LIBRARY,
  STRETCHES,
  findRecoveryMove,
  holdSeconds,
  isPerSide,
  milestonesFor,
  resolveLymph,
  resolveRoutines,
  resolveStep,
  type RoutineStep,
} from "./recovery";
import {
  EXERCISE_DB,
  MOVEMENT_FLAGS,
  MUSCLE_KEYS,
  exerciseSlug,
} from "./exercises";
import { movementRemovalReason, removedMovementFlags } from "./conditions";
import type { BoneHealth } from "@/lib/types/database";

const BONE: (BoneHealth | null)[] = [
  null,
  "none",
  "untested",
  "osteopenia",
  "osteoporosis",
];

const allSteps: RoutineStep[] = [...STRETCHES.flatMap((r) => r.steps), ...LYMPH];

/** The dose a step actually renders at: its own, or the movement's. */
function doseOf(s: RoutineStep): string {
  return s.dose ?? findRecoveryMove(s.move)?.dose ?? "";
}

/** Every movement the screen would render for these declarations. */
function prescribed(bone_health: BoneHealth | null) {
  return [
    ...resolveRoutines({ bone_health }).flatMap((r) => r.moves),
    ...resolveLymph({ bone_health }),
  ];
}

describe("the movement library", () => {
  it("gives every movement cues, a safety note and both variations", () => {
    // The same bar plan.test.ts holds the 28 exercises to.
    for (const m of RECOVERY_LIBRARY) {
      expect(m.c.length, `${m.n} cues`).toBeGreaterThan(0);
      expect(m.s, `${m.n} safety note`).toBeTruthy();
      expect(m.e, `${m.n} easier variation`).toBeTruthy();
      expect(m.h, `${m.n} harder variation`).toBeTruthy();
    }
  });

  it("carries no dose in a movement name", () => {
    // Dose belongs to the routine. A name like "Cat–cow × 8" would quietly
    // become a second movement the next time a routine wanted × 10.
    for (const m of RECOVERY_LIBRARY) {
      expect(m.n, `${m.n} looks like it has a dose in it`).not.toMatch(
        /[×x]\s*\d|\d+\s*(s|min|sec)\b/i,
      );
    }
  });

  it("uses only known movement flags, with no duplicates", () => {
    for (const m of RECOVERY_LIBRARY) {
      const flags = m.contra ?? [];
      for (const f of flags) {
        expect(MOVEMENT_FLAGS, `${m.n} has an unknown flag`).toContain(f);
      }
      expect(new Set(flags).size, `${m.n} repeats a flag`).toBe(flags.length);
    }
  });

  it("has no duplicate names", () => {
    const names = RECOVERY_LIBRARY.map((m) => m.n);
    expect(new Set(names).size).toBe(names.length);
  });

  it("shares no slug with the exercise library", () => {
    // C29 puts these at /recover/[slug] beside /train/[slug]. Two movements
    // that slugify the same would make one of them unreachable.
    const exercises = MUSCLE_KEYS.flatMap((k) =>
      EXERCISE_DB[k].ex.map((e) => exerciseSlug(e.n)),
    );
    const recovery = RECOVERY_LIBRARY.map((m) => exerciseSlug(m.n));
    expect(new Set(recovery).size, "recovery slugs collide").toBe(
      recovery.length,
    );
    for (const slug of recovery) {
      expect(exercises, `${slug} collides with an exercise`).not.toContain(slug);
    }
  });

  it("gives every flagged movement somewhere to go", () => {
    // A flagged movement with no swap is prescribed anyway, since recovery
    // substitutes rather than drops. Silent no-op, worst possible failure.
    for (const m of RECOVERY_LIBRARY) {
      if ((m.contra ?? []).length && removedMovementFlags({
        bone_health: "osteoporosis",
      }).some((f) => (m.contra ?? []).includes(f))) {
        expect(m.swap, `${m.n} is removable but has no swap`).toBeTruthy();
      }
    }
  });

  it("resolves every swap, and never swaps to something itself flagged", () => {
    for (const m of RECOVERY_LIBRARY) {
      if (!m.swap) continue;
      const target = findRecoveryMove(m.swap);
      expect(target, `${m.n} swaps to unknown "${m.swap}"`).toBeTruthy();
      expect(target?.contra ?? [], `${m.n} swaps to a flagged move`).toEqual([]);
      expect(m.swap, `${m.n} swaps to itself`).not.toBe(m.n);
    }
  });

  it("resolves every milestone swap without leaving it flagged", () => {
    for (const m of MILESTONES) {
      if (m.swap) expect(m.swap.contra ?? [], `${m.n} swap`).toEqual([]);
    }
  });
});

describe("routines reference the library", () => {
  it("names a real movement in every step", () => {
    for (const s of [...allSteps, { move: BREATHING_MOVE, dose: "" }]) {
      expect(findRecoveryMove(s.move), `unknown movement: ${s.move}`).toBeTruthy();
    }
  });

  it("gives every step a dose, its own or the movement's", () => {
    for (const s of allSteps) {
      expect(doseOf(s), `${s.move} has no dose`).toBeTruthy();
    }
  });

  it("reuses one movement at different doses rather than duplicating it", () => {
    // The reason C28 split name from dose. Guards against the split being
    // quietly undone by re-adding a second near-identical entry.
    const resolved = resolveRoutines({ bone_health: "osteoporosis" });
    const rockBacks = resolved
      .flatMap((r) => r.moves)
      .filter((m) => m.n === "Quadruped rock-back");
    expect(rockBacks.length).toBeGreaterThan(1);
    expect(new Set(rockBacks.map((m) => m.dose)).size).toBeGreaterThan(1);
  });

  it("leaves nothing in the library unreachable", () => {
    // Dead content is content nobody maintains. Every movement must be either
    // prescribed by a routine, a swap target, or the breathing timer.
    const referenced = new Set<string>([
      ...allSteps.map((s) => s.move),
      ...RECOVERY_LIBRARY.flatMap((m) => (m.swap ? [m.swap] : [])),
      BREATHING_MOVE,
    ]);
    for (const m of RECOVERY_LIBRARY) {
      expect(referenced.has(m.n), `${m.n} is never prescribed`).toBe(true);
    }
  });
});

describe("osteoporosis never reaches a contraindicated recovery move", () => {
  it("holds across every routine and the lymph sequence", () => {
    const banned = removedMovementFlags({ bone_health: "osteoporosis" });
    expect(banned.length).toBeGreaterThan(0);
    for (const m of prescribed("osteoporosis")) {
      for (const f of m.contra ?? []) {
        expect(banned, `${m.n} was prescribed despite ${f}`).not.toContain(f);
      }
    }
  });

  it("holds for the milestones too", () => {
    const banned = removedMovementFlags({ bone_health: "osteoporosis" });
    const shown = milestonesFor({ bone_health: "osteoporosis" }).map((x) => x.n);
    for (const m of MILESTONES) {
      if ((m.contra ?? []).some((f) => banned.includes(f))) {
        expect(shown, `${m.n} is still offered as a milestone`).not.toContain(
          m.n,
        );
      }
    }
  });

  it("is not a vacuous sweep — the flagged moves do exist and are prescribed", () => {
    // Without this, deleting the filter entirely would still pass everything
    // above if nothing in the library were flagged.
    const banned = removedMovementFlags({ bone_health: "osteoporosis" });
    const undeclared = prescribed(null);
    const removable = undeclared.filter((m) =>
      (m.contra ?? []).some((f) => banned.includes(f)),
    );
    expect(removable.length).toBeGreaterThan(0);
  });
});

describe("swapping, not dropping", () => {
  it("keeps every routine the same length and duration", () => {
    for (const bone_health of BONE) {
      const resolved = resolveRoutines({ bone_health });
      resolved.forEach((r, i) => {
        expect(r.moves, `${r.n} changed length`).toHaveLength(
          STRETCHES[i].steps.length,
        );
        expect(r.min).toBe(STRETCHES[i].min);
      });
    }
  });

  it("carries the routine's dose onto the replacement", () => {
    // A swap that lost its dose would render "Quadruped rock-back" with no
    // indication of whether that is eight reps or ninety seconds.
    for (const m of prescribed("osteoporosis")) {
      expect(m.dose, `${m.n} lost its dose`).toBeTruthy();
    }
  });

  it("keeps the milestone list at exactly five, in their stored slots", () => {
    // profiles.mobility is a boolean[5] with a CHECK, indexed positionally.
    // A list that changed length would silently re-point every tick.
    for (const bone_health of BONE) {
      expect(milestonesFor({ bone_health })).toHaveLength(5);
    }
  });

  it("says what it swapped and why", () => {
    const swapped = prescribed("osteoporosis").filter((m) => m.swappedFrom);
    expect(swapped.length).toBeGreaterThan(0);
    for (const m of swapped) {
      expect(m.reason, `${m.n} swapped without a reason`).toContain(
        "osteoporosis",
      );
      expect(m.n).not.toBe(m.swappedFrom);
    }
  });

  it("leaves everything alone when nothing is declared", () => {
    for (const bone_health of ["none", "untested", "osteopenia", null] as const) {
      const moves = prescribed(bone_health);
      expect(moves.map((m) => m.n)).toEqual(allSteps.map((s) => s.move));
      expect(moves.some((m) => m.swappedFrom)).toBe(false);
    }
  });

  it("leaves the milestones alone for osteopenia", () => {
    // Osteopenia removes nothing by design — the evidence favours loading that
    // spine carefully over avoiding it. Guards against a well-meaning widening.
    expect(milestonesFor({ bone_health: "osteopenia" }).map((m) => m.n)).toEqual(
      MILESTONES.map((m) => m.n),
    );
  });
});

describe("dose parsing, which drives the detail timer", () => {
  it("reads seconds and minutes out of a hold", () => {
    expect(holdSeconds("90 s")).toBe(90);
    expect(holdSeconds("45 s / side")).toBe(45);
    expect(holdSeconds("3 min")).toBe(180);
    expect(holdSeconds("1.5 min")).toBe(90);
  });

  it("returns null for a rep count, so the timer counts up instead", () => {
    expect(holdSeconds("× 8, slow")).toBeNull();
    expect(holdSeconds("× 10 each way")).toBeNull();
    expect(holdSeconds("× 15 / leg")).toBeNull();
    expect(holdSeconds("")).toBeNull();
  });

  it("does not mistake a rep count for a duration", () => {
    // "× 8, slow" contains no unit; an over-eager regex reading the digit
    // would start an 8-second countdown on an eight-rep movement.
    expect(holdSeconds("× 5 / side")).toBeNull();
    expect(holdSeconds("× 10 each way")).toBeNull();
  });

  it("spots a per-side dose", () => {
    expect(isPerSide("45 s / side")).toBe(true);
    expect(isPerSide("× 15 / leg")).toBe(true);
    expect(isPerSide("90 s")).toBe(false);
  });

  it("parses every dose in every routine to something usable", () => {
    for (const s of allSteps) {
      const dose = doseOf(s);
      const hold = holdSeconds(dose);
      const reps = /[×x]\s*\d/.test(dose);
      expect(
        hold !== null || reps,
        `${s.move}: dose "${dose}" is neither a hold nor a rep count`,
      ).toBe(true);
      if (hold !== null) {
        expect(hold, `${s.move}: implausible hold`).toBeGreaterThan(0);
        expect(hold, `${s.move}: implausible hold`).toBeLessThanOrEqual(600);
      }
    }
  });
});

describe("detail routing", () => {
  it("resolves every library movement from its slug", () => {
    // The C29 accept criterion. A movement that cannot round-trip its slug has
    // a page nobody can reach.
    for (const m of RECOVERY_LIBRARY) {
      const slug = exerciseSlug(m.n);
      expect(slug, `${m.n} slugs to nothing`).toBeTruthy();
      const back = RECOVERY_LIBRARY.find((x) => exerciseSlug(x.n) === slug);
      expect(back?.n, `${m.n} does not round-trip`).toBe(m.n);
    }
  });

  it("sends a withheld movement somewhere better, not to a dead end", () => {
    const banned = removedMovementFlags({ bone_health: "osteoporosis" });
    for (const m of RECOVERY_LIBRARY) {
      if (!(m.contra ?? []).some((f) => banned.includes(f))) continue;
      const reason = movementRemovalReason(m.contra ?? [], {
        bone_health: "osteoporosis",
      });
      expect(reason, `${m.n} is withheld with no explanation`).toBeTruthy();
      const replacement = m.swap ? findRecoveryMove(m.swap) : null;
      expect(replacement, `${m.n} is withheld with nowhere to go`).toBeTruthy();
      expect(exerciseSlug(replacement!.n)).toBeTruthy();
    }
  });

  it("withholds nothing when nothing is declared", () => {
    for (const m of RECOVERY_LIBRARY) {
      expect(
        movementRemovalReason(m.contra ?? [], { bone_health: null }),
        `${m.n} is withheld from someone who declared nothing`,
      ).toBeNull();
    }
  });
});

describe("resolveStep", () => {
  it("passes a clean movement through with its dose", () => {
    const out = resolveStep(
      { move: "Hip circles", dose: "× 10 each way" },
      { bone_health: "osteoporosis" },
    );
    expect(out.n).toBe("Hip circles");
    expect(out.dose).toBe("× 10 each way");
    expect(out.swappedFrom).toBeUndefined();
  });

  it("returns the original when the declaration does not rule it out", () => {
    expect(
      resolveStep({ move: "Child's pose", dose: "90 s" }, { bone_health: null })
        .n,
    ).toBe("Child's pose");
  });

  it("returns the swap, fully populated, when it does", () => {
    const out = resolveStep(
      { move: "Child's pose", dose: "90 s" },
      { bone_health: "osteoporosis" },
    );
    expect(out.n).toBe("Quadruped rock-back");
    expect(out.swappedFrom).toBe("Child's pose");
    // The whole point of swapping by reference: the replacement is as
    // documented as the movement it replaced.
    expect(out.c.length).toBeGreaterThan(0);
    expect(out.e).toBeTruthy();
    expect(out.h).toBeTruthy();
  });

  it("throws on a step naming a movement that is not in the library", () => {
    expect(() =>
      resolveStep({ move: "Levitation", dose: "60 s" }, { bone_health: null }),
    ).toThrow(/Unknown recovery movement/);
  });
});
