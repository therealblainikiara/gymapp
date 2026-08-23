import { describe, expect, it } from "vitest";
import { defaultProfile, toggleMobility } from "./store";

const USER = "11111111-1111-1111-1111-111111111111";

describe("mobility toggle", () => {
  it("flips the milestone it was asked to flip", () => {
    expect(toggleMobility([false, false, false, false, false], 2)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(toggleMobility([false, false, true, false, false], 2)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("leaves the other milestones alone", () => {
    expect(toggleMobility([true, false, true, false, true], 1)).toEqual([
      true,
      true,
      true,
      false,
      true,
    ]);
  });

  it.each([
    ["undefined", undefined],
    ["empty", [] as boolean[]],
    ["short", [true]],
    ["over-long", [true, false, true, false, true, true, true]],
  ])(
    "always returns exactly five booleans from a %s array",
    (_label, current) => {
      for (let i = 0; i < 5; i++) {
        const next = toggleMobility(current, i);
        // The column is CHECK(array_length = 5); anything else is a write the
        // database rejects, which stalls every queued write behind it.
        expect(next).toHaveLength(5);
        for (const v of next) expect(typeof v).toBe("boolean");
      }
    },
  );

  it("coerces non-boolean junk from an old save", () => {
    const junk = [1, "yes", null, undefined, {}] as unknown as boolean[];
    expect(toggleMobility(junk, 0)).toEqual([true, false, false, false, false]);
  });
});

describe("default profile", () => {
  it("matches the column defaults the migration declares", () => {
    const p = defaultProfile(USER);
    expect(p).toMatchObject({
      id: USER,
      goal: "general",
      muscles: [],
      level: "intermediate",
      kit: "dbbw",
      session_len: 30,
      avail_days: [1, 3, 5],
      pref_time: "morning",
      dietary: [],
      injuries: [],
    });
    expect(p.mobility).toEqual([false, false, false, false, false]);
  });

  it("leaves the disclaimer and intake stamps unset", () => {
    // These two are what the gate reads. A default that looked accepted would
    // open the app to someone who never saw the terms.
    const p = defaultProfile(USER);
    expect(p.disclaimer_accepted_at).toBeNull();
    expect(p.disclaimer_version).toBeNull();
    expect(p.intake_completed_at).toBeNull();
  });
});
