import { describe, expect, it } from "vitest";
import {
  LYMPH,
  MILESTONES,
  STRETCHES,
  milestonesFor,
  resolveLymph,
  resolveMove,
  resolveRoutines,
  type RecoveryMove,
} from "./recovery";
import { MOVEMENT_FLAGS } from "./exercises";
import { removedMovementFlags } from "./conditions";
import type { BoneHealth } from "@/lib/types/database";

const BONE: (BoneHealth | null)[] = [
  null,
  "none",
  "untested",
  "osteopenia",
  "osteoporosis",
];

/** Every move the screen would render for these declarations. */
function prescribed(bone_health: BoneHealth | null) {
  return [
    ...resolveRoutines({ bone_health }).flatMap((r) => r.moves),
    ...resolveLymph({ bone_health }),
  ];
}

const authored: RecoveryMove[] = [
  ...STRETCHES.flatMap((r) => r.moves),
  ...LYMPH,
];

describe("the library itself", () => {
  it("gives every move a cue and a safety note", () => {
    for (const m of authored) {
      expect(m.c, `${m.n} cue`).toBeTruthy();
      expect(m.s, `${m.n} safety note`).toBeTruthy();
    }
  });

  it("uses only known movement flags", () => {
    for (const m of authored) {
      for (const f of m.contra ?? []) {
        expect(MOVEMENT_FLAGS, `${m.n} has an unknown flag`).toContain(f);
      }
    }
  });

  it("gives every flagged move somewhere to go", () => {
    // A flagged move with no swap would be prescribed anyway, since recovery
    // substitutes rather than drops. Silent no-op, worst possible failure.
    for (const m of authored) {
      if ((m.contra ?? []).length) {
        expect(m.swap, `${m.n} is flagged but has no swap`).toBeTruthy();
      }
    }
  });

  it("never swaps to something that is itself flagged", () => {
    // This is the hole that would let a contraindicated move through the
    // filter untouched.
    for (const m of [...authored, ...MILESTONES]) {
      if (m.swap) {
        expect(m.swap.contra ?? [], `${m.n} swaps to a flagged move`).toEqual(
          [],
        );
      }
    }
  });

  it("has no duplicate names, originals and swaps together", () => {
    const all = [...authored, ...MILESTONES].flatMap((m) =>
      m.swap ? [m.n, m.swap.n] : [m.n],
    );
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("osteoporosis never reaches a contraindicated recovery move", () => {
  // The counterpart of the plan sweep in plan.test.ts. Recovery content is
  // fixed rather than generated, so the combinatorics live in the declarations.
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
    const flagged = authored.filter((m) => (m.contra ?? []).length);
    expect(flagged.length).toBeGreaterThan(0);
    const undeclared = prescribed(null).map((m) => m.n);
    for (const m of flagged) {
      expect(undeclared, `${m.n} is flagged but never prescribed`).toContain(
        m.n,
      );
    }
  });
});

describe("swapping, not dropping", () => {
  it("keeps every routine the same length", () => {
    for (const bone_health of BONE) {
      const resolved = resolveRoutines({ bone_health });
      resolved.forEach((r, i) => {
        expect(r.moves, `${r.n} changed length`).toHaveLength(
          STRETCHES[i].moves.length,
        );
        expect(r.min).toBe(STRETCHES[i].min);
      });
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
      expect(moves.map((m) => m.n)).toEqual(authored.map((m) => m.n));
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

describe("resolveMove", () => {
  const flagged: RecoveryMove = {
    n: "Original",
    c: "cue",
    s: "note",
    contra: ["spinal_flexion"],
    swap: { n: "Replacement", c: "cue", s: "note" },
  };

  it("passes a clean move straight through, identity intact", () => {
    const clean: RecoveryMove = { n: "Clean", c: "cue", s: "note" };
    expect(resolveMove(clean, { bone_health: "osteoporosis" })).toBe(clean);
  });

  it("returns the original when the declaration does not rule it out", () => {
    expect(resolveMove(flagged, { bone_health: null }).n).toBe("Original");
  });

  it("returns the swap when it does", () => {
    const out = resolveMove(flagged, { bone_health: "osteoporosis" });
    expect(out.n).toBe("Replacement");
    expect(out.swappedFrom).toBe("Original");
  });

  it("prescribes the original when a flagged move has no swap", () => {
    // Documents the failure mode the library test above exists to prevent:
    // there is nowhere else to go, and an empty slot is not an option.
    const orphan: RecoveryMove = {
      n: "Orphan",
      c: "cue",
      s: "note",
      contra: ["spinal_flexion"],
    };
    expect(resolveMove(orphan, { bone_health: "osteoporosis" }).n).toBe(
      "Orphan",
    );
  });
});
