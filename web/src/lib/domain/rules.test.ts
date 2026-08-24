import { describe, expect, it } from "vitest";
import { adjustsPlan, applyRules, removalsFor } from "./rules";
import type { Declarations } from "./conditions";
import type { ConditionKey } from "@/lib/types/database";

const CLEARED = "2026-08-24T10:00:00Z";

const nothing: Declarations = {
  menopause_stage: null,
  bone_health: null,
  pelvic_floor: null,
  conditions: [],
  clinician_cleared_at: null,
};

/** A profile that declared `patch` and has been through a clinician. */
function cleared(patch: Partial<Declarations>): Declarations {
  return { ...nothing, ...patch, clinician_cleared_at: CLEARED };
}

describe("nothing declared changes nothing", () => {
  it("returns an empty adjustment", () => {
    expect(adjustsPlan(applyRules(nothing))).toBe(false);
    expect(applyRules(nothing).reasons).toEqual([]);
  });

  it("is unchanged by a stale clearance with nothing behind it", () => {
    // A tick left over from a condition since removed must not switch rules on.
    expect(
      adjustsPlan(applyRules({ ...nothing, clinician_cleared_at: CLEARED })),
    ).toBe(false);
  });

  it("changes nothing for answers that are not declarations", () => {
    for (const patch of [
      { bone_health: "untested" as const },
      { bone_health: "none" as const },
      { menopause_stage: "pre" as const },
      { menopause_stage: "undisclosed" as const },
      { pelvic_floor: "none" as const },
    ]) {
      expect(adjustsPlan(applyRules(cleared(patch))), String(patch)).toBe(false);
    }
  });
});

describe("the clinician gate", () => {
  const declared = { bone_health: "osteoporosis" as const };

  it("holds back every addition and adjustment", () => {
    const a = applyRules({ ...nothing, ...declared });
    expect(a.boneLoading).toBe(false);
    expect(a.reps).toBeNull();
    expect(a.extraRestSec).toBe(0);
    expect(a.minFullBodyDays).toBe(0);
    expect(a.notes).toEqual([]);
  });

  it("does not hold back a single removal", () => {
    // The asymmetry C20 established: the gate governs what the plan adds.
    // Withholding a loaded toe-touch is the absence of programming.
    for (const patch of [
      { bone_health: "osteoporosis" as const },
      { pelvic_floor: "diagnosed" as const },
      { conditions: ["frozen_shoulder"] as ConditionKey[] },
      { conditions: ["oa_knee"] as ConditionKey[] },
      { conditions: ["hypertension"] as ConditionKey[] },
    ]) {
      const ungated = applyRules({ ...nothing, ...patch });
      const gated = applyRules(cleared(patch));
      expect(ungated.removes.length, String(patch)).toBeGreaterThan(0);
      expect(ungated.removes).toEqual(gated.removes);
    }
  });

  it("opens everything once clearance is recorded", () => {
    expect(applyRules(cleared({ bone_health: "osteoporosis" })).boneLoading).toBe(
      true,
    );
  });
});

describe("each rule fires on its trigger and only on its trigger", () => {
  it("bone loading — low bone density", () => {
    for (const bone_health of ["osteopenia", "osteoporosis"] as const) {
      expect(applyRules(cleared({ bone_health })).boneLoading).toBe(true);
    }
    for (const bone_health of ["none", "untested", null] as const) {
      expect(applyRules(cleared({ bone_health })).boneLoading).toBe(false);
    }
    // Not triggered by anything else, however serious.
    expect(
      applyRules(cleared({ conditions: ["oa_knee", "hypertension"] }))
        .boneLoading,
    ).toBe(false);
  });

  it("rep-range shift — peri or post menopause", () => {
    for (const menopause_stage of ["peri", "post"] as const) {
      expect(applyRules(cleared({ menopause_stage })).reps).toBe("6–8");
    }
    for (const menopause_stage of ["pre", "undisclosed", null] as const) {
      expect(applyRules(cleared({ menopause_stage })).reps).toBeNull();
    }
    expect(applyRules(cleared({ bone_health: "osteoporosis" })).reps).toBeNull();
  });

  it("pelvic floor — removes impact and braced effort, not gentle holds", () => {
    for (const pelvic_floor of ["occasional", "diagnosed"] as const) {
      const r = applyRules({ ...nothing, pelvic_floor }).removes;
      expect(r).toContain("impact");
      expect(r).toContain("valsalva");
      // The flag split exists for exactly this: box breathing's four-second
      // pauses are the opposite of the mechanism the rule is about.
      expect(r).not.toContain("breath_hold");
    }
    expect(applyRules({ ...nothing, pelvic_floor: "none" }).removes).toEqual([]);
  });

  it("blood pressure — drops long holds, lengthens rests, adds a cue", () => {
    const a = applyRules(cleared({ conditions: ["hypertension"] }));
    expect(a.removes).toContain("isometric_hold");
    expect(a.extraRestSec).toBe(30);
    expect(a.notes.join(" ")).toContain("Breathe out");
    // Overhead work stays: "maximal" is a load, not a movement, and taking the
    // press away from someone who can press safely is the wrong instrument.
    expect(a.removes).not.toContain("overhead");
    expect(applyRules(cleared({ conditions: ["oa_knee"] })).extraRestSec).toBe(0);
  });

  it("tendinopathy — a note, because the site is not recorded", () => {
    const a = applyRules(cleared({ conditions: ["tendinopathy"] }));
    expect(a.notes.join(" ")).toContain("isometric");
    // Nothing is swapped or removed: `conditions` records that there is a
    // tendinopathy, not where, so there is no affected pattern to swap.
    expect(a.removes).toEqual([]);
    expect(a.reasons.join(" ")).toContain("which tendon");
  });

  it("OA knee and hip — caps depth", () => {
    for (const c of ["oa_knee", "oa_hip"] as ConditionKey[]) {
      expect(applyRules({ ...nothing, conditions: [c] }).removes).toContain(
        "deep_knee_flexion",
      );
    }
    expect(
      applyRules(cleared({ conditions: ["oa_knee"] })).notes.join(" "),
    ).toContain("cycling");
    expect(
      applyRules({ ...nothing, conditions: ["hypertension"] }).removes,
    ).not.toContain("deep_knee_flexion");
  });

  it("frozen shoulder — nothing overhead", () => {
    expect(
      applyRules({ ...nothing, conditions: ["frozen_shoulder"] }).removes,
    ).toContain("overhead");
    expect(
      applyRules({ ...nothing, conditions: ["tendinopathy"] }).removes,
    ).not.toContain("overhead");
  });

  it("type 2 diabetes — timing and foot care", () => {
    const a = applyRules(cleared({ conditions: ["type2_diabetes"] }));
    expect(a.notes.join(" ")).toContain("feet");
    expect(a.removes).toEqual([]);
  });

  it("resistance floor — any bone or menopause declaration", () => {
    expect(
      applyRules(cleared({ bone_health: "osteopenia" })).minFullBodyDays,
    ).toBe(2);
    expect(
      applyRules(cleared({ menopause_stage: "post" })).minFullBodyDays,
    ).toBe(2);
    // Not every condition implies it — a frozen shoulder is not sarcopenia.
    expect(
      applyRules(cleared({ conditions: ["frozen_shoulder"] })).minFullBodyDays,
    ).toBe(0);
  });
});

describe("every rule that changes something says so", () => {
  const each: [string, Partial<Declarations>][] = [
    ["bone loading", { bone_health: "osteopenia" }],
    ["rep range", { menopause_stage: "peri" }],
    ["pelvic floor", { pelvic_floor: "diagnosed" }],
    ["blood pressure", { conditions: ["hypertension"] }],
    ["tendinopathy", { conditions: ["tendinopathy"] }],
    ["OA", { conditions: ["oa_knee"] }],
    ["frozen shoulder", { conditions: ["frozen_shoulder"] }],
  ];

  it.each(each)("%s carries a reason", (_label, patch) => {
    // The clause that makes M6 trustworthy rather than magic: a plan that
    // changed and cannot say why is indistinguishable from a plan with a bug.
    const a = applyRules(cleared(patch));
    expect(adjustsPlan(a)).toBe(true);
    expect(a.reasons.length).toBeGreaterThan(0);
    for (const r of a.reasons) expect(r.length).toBeGreaterThan(20);
  });

  it("names the declaration, not just the change", () => {
    expect(
      applyRules(cleared({ menopause_stage: "peri" })).reasons.join(" "),
    ).toContain("perimenopausal");
    expect(
      applyRules(cleared({ menopause_stage: "post" })).reasons.join(" "),
    ).toContain("post-menopausal");
  });

  it("explains a removal even with no clearance", () => {
    // The plan is filtered before the gate opens, so the explanation has to
    // arrive before it too, or the user sees a silently shorter plan.
    const a = applyRules({ ...nothing, conditions: ["frozen_shoulder"] });
    expect(a.reasons.join(" ")).toContain("overhead");
  });
});

describe("composition — rules that disagree", () => {
  it("blood pressure and bone loading do not prescribe max-effort impact", () => {
    // The pair the M6 plan names as the real gate.
    const a = applyRules(
      cleared({ bone_health: "osteoporosis", conditions: ["hypertension"] }),
    );
    expect(a.boneLoading).toBe(true);
    expect(a.notes.join(" ")).toContain("submaximal");
    expect(a.notes.join(" ")).toContain("never hold your breath");
    expect(a.extraRestSec).toBe(30);
  });

  it("pelvic floor beats bone loading, and says so", () => {
    // A direct contradiction: one rule adds impact, the other removes it.
    // Removals win, and the user is told rather than shown an empty block.
    const a = applyRules(
      cleared({ bone_health: "osteoporosis", pelvic_floor: "diagnosed" }),
    );
    expect(a.removes).toContain("impact");
    expect(a.boneLoading).toBe(false);
    expect(a.boneLoadingBlocked).toBe(true);
    const why = a.reasons.join(" ");
    expect(why).toContain("bone health");
    expect(why).toContain("pelvic floor");
    expect(why).toContain("clinician");
  });

  it("accumulates removals from every declaration at once", () => {
    const a = applyRules(
      cleared({
        bone_health: "osteoporosis",
        pelvic_floor: "diagnosed",
        conditions: ["hypertension", "oa_knee", "frozen_shoulder"],
      }),
    );
    for (const f of [
      "spinal_flexion",
      "spinal_rotation",
      "impact",
      "valsalva",
      "isometric_hold",
      "deep_knee_flexion",
      "overhead",
    ]) {
      expect(a.removes, `${f} missing`).toContain(f);
    }
    expect(new Set(a.removes).size).toBe(a.removes.length);
  });

  it("keeps every reason when several rules fire together", () => {
    const a = applyRules(
      cleared({
        bone_health: "osteopenia",
        menopause_stage: "peri",
        conditions: ["oa_knee"],
      }),
    );
    const why = a.reasons.join(" ");
    expect(why).toContain("Impact work");
    expect(why).toContain("6–8");
    expect(why).toContain("Depth capped");
    expect(new Set(a.reasons).size).toBe(a.reasons.length);
  });

  it("removalsFor and applyRules never disagree", () => {
    // `safe()` reads one and the screen reads the other; a divergence would
    // filter the plan by one set of rules and explain it with another.
    const combos: Partial<Declarations>[] = [
      {},
      { bone_health: "osteoporosis" },
      { pelvic_floor: "occasional" },
      { conditions: ["hypertension", "frozen_shoulder"] },
      { bone_health: "osteoporosis", pelvic_floor: "diagnosed" },
    ];
    for (const patch of combos) {
      const d = { ...nothing, ...patch };
      expect(applyRules(d).removes).toEqual(removalsFor(d));
      expect(applyRules(cleared(patch)).removes).toEqual(
        removalsFor(cleared(patch)),
      );
    }
  });
});

describe("the reasons describe what actually happens", () => {
  it("does not claim the rep shift is limited to compounds", () => {
    // The library carries no compound/accessory distinction, so the override
    // reaches every prescribed movement. A reason saying "compound lifts" was
    // describing a narrower rule than the one that runs.
    const why = applyRules(cleared({ menopause_stage: "peri" })).reasons.join(
      " ",
    );
    expect(why).not.toContain("Compound lifts");
    expect(why).toContain("Your lifts");
  });

  it("says nothing about impact when impact was blocked", () => {
    const a = applyRules(
      cleared({ bone_health: "osteoporosis", pelvic_floor: "diagnosed" }),
    );
    expect(a.reasons.join(" ")).not.toContain("Impact work added");
  });

  it("repeats no reason and no note", () => {
    const a = applyRules(
      cleared({ bone_health: "osteopenia", conditions: ["hypertension"] }),
    );
    expect(new Set(a.notes).size).toBe(a.notes.length);
    expect(new Set(a.reasons).size).toBe(a.reasons.length);
  });
});
