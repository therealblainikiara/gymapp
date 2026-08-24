import { describe, expect, it } from "vitest";
import {
  asBoneHealth,
  asConditions,
  asMenopauseStage,
  asPelvicFloor,
  conditionProgrammingActive,
  declaresProgrammingCondition,
  offersHealthStep,
  offersMenopauseQuestion,
  offersPelvicFloorQuestion,
} from "./conditions";

import type { ConditionKey, ProfileRow } from "@/lib/types/database";

const nothing: Pick<
  ProfileRow,
  "menopause_stage" | "bone_health" | "pelvic_floor" | "conditions"
> = {
  menopause_stage: null,
  bone_health: null,
  pelvic_floor: null,
  conditions: [],
};

describe("which questions intake offers", () => {
  it("offers menopause to women from 40", () => {
    expect(offersMenopauseQuestion({ sex: "f", age: 47 })).toBe(true);
    expect(offersMenopauseQuestion({ sex: "f", age: 39 })).toBe(false);
  });

  it("does not offer it to men", () => {
    expect(offersMenopauseQuestion({ sex: "m", age: 50 })).toBe(false);
  });

  it("offers it when age is unknown rather than assuming young", () => {
    // A blank age field is not evidence of being 30.
    expect(offersMenopauseQuestion({ sex: "f", age: null })).toBe(true);
  });

  it("offers the health step to anyone 45+, either sex", () => {
    expect(offersHealthStep({ sex: "m", age: 52 })).toBe(true);
    expect(offersHealthStep({ sex: "f", age: 52 })).toBe(true);
    expect(offersHealthStep({ sex: "m", age: 30 })).toBe(false);
  });

  it("still offers the health step to a younger woman, for the menopause question", () => {
    // Early and surgical menopause both happen well before 45.
    expect(offersHealthStep({ sex: "f", age: 42 })).toBe(true);
  });

  it("offers pelvic floor to women at any age", () => {
    expect(offersPelvicFloorQuestion({ sex: "f", age: 28 })).toBe(true);
  });
});

describe("what counts as a declaration", () => {
  it("is nothing when nothing is declared", () => {
    expect(declaresProgrammingCondition(nothing)).toBe(false);
  });

  it.each([
    ["osteopenia", { bone_health: "osteopenia" as const }],
    ["osteoporosis", { bone_health: "osteoporosis" as const }],
    ["perimenopause", { menopause_stage: "peri" as const }],
    ["post-menopause", { menopause_stage: "post" as const }],
    ["occasional leaking", { pelvic_floor: "occasional" as const }],
    ["a diagnosed condition", { conditions: ["oa_knee"] as ConditionKey[] }],
  ])("counts %s", (_label, patch) => {
    expect(declaresProgrammingCondition({ ...nothing, ...patch })).toBe(true);
  });

  it.each([
    ["never tested", { bone_health: "untested" as const }],
    ["no bone issues", { bone_health: "none" as const }],
    ["pre-menopause", { menopause_stage: "pre" as const }],
    ["rather not say", { menopause_stage: "undisclosed" as const }],
    ["no pelvic floor issues", { pelvic_floor: "none" as const }],
  ])("does not count %s", (_label, patch) => {
    // Answering a question is not the same as declaring a condition — these
    // must not trigger the clinician gate or the user is nagged for nothing.
    expect(declaresProgrammingCondition({ ...nothing, ...patch })).toBe(false);
  });
});

describe("the clinician gate", () => {
  const declared = { ...nothing, bone_health: "osteoporosis" as const };

  it("stays shut on a self-report alone", () => {
    expect(
      conditionProgrammingActive({ ...declared, clinician_cleared_at: null }),
    ).toBe(false);
  });

  it("opens once clearance is recorded", () => {
    expect(
      conditionProgrammingActive({
        ...declared,
        clinician_cleared_at: "2026-08-23T10:00:00Z",
      }),
    ).toBe(true);
  });

  it("stays shut when clearance exists but nothing is declared", () => {
    // A stale tick from a condition since removed must not keep anything on.
    expect(
      conditionProgrammingActive({
        ...nothing,
        clinician_cleared_at: "2026-08-23T10:00:00Z",
      }),
    ).toBe(false);
  });
});

describe("validators mirror the CHECK constraints", () => {
  // A value the database rejects stalls every queued write behind it, so these
  // are the last line before the outbox.
  it("passes valid values through", () => {
    expect(asMenopauseStage("peri")).toBe("peri");
    expect(asBoneHealth("osteoporosis")).toBe("osteoporosis");
    expect(asPelvicFloor("occasional")).toBe("occasional");
    expect(asConditions(["oa_knee", "hypertension"])).toEqual([
      "oa_knee",
      "hypertension",
    ]);
  });

  it("rejects anything the constraint would", () => {
    for (const junk of ["menopause", "", null, undefined, 7, {}]) {
      expect(asMenopauseStage(junk)).toBeNull();
      expect(asBoneHealth(junk)).toBeNull();
      expect(asPelvicFloor(junk)).toBeNull();
    }
  });

  it("drops unknown conditions rather than failing the whole write", () => {
    expect(asConditions(["oa_knee", "lycanthropy", 42, null])).toEqual([
      "oa_knee",
    ]);
  });

  it("de-duplicates conditions", () => {
    // `conditions <@ array[...]` allows duplicates; the UI should not create
    // them and neither should a round-trip.
    expect(asConditions(["oa_knee", "oa_knee"])).toEqual(["oa_knee"]);
  });

  it("survives a non-array", () => {
    expect(asConditions("oa_knee")).toEqual([]);
    expect(asConditions(null)).toEqual([]);
  });
});
