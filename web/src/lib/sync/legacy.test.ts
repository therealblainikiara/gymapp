import { describe, expect, it } from "vitest";
import { planLegacyImport } from "./legacy";

const USER = "11111111-1111-1111-1111-111111111111";
let counter = 0;
const newId = () => `id-${++counter}`;

/** A realistic blob, as the prototype would have written it. */
const blob = {
  accepted: true,
  onboardDone: true,
  settings: {
    goal: "fat",
    muscles: ["legs", "core"],
    level: "advanced",
    kit: "bw",
    len: 45,
    availDays: [2, 0, 4],
    prefTime: "evening",
    dietary: ["gf", "nf"],
    injuries: ["knee"],
  },
  devices: { watch: true, phone: false, scale: false, hrm: true },
  checkins: [{ date: "2026-08-20", sleep: 4, stress: 2, energy: 5 }],
  hydro: { date: "2026-08-23", ml: 1500 },
  weights: [
    { date: "2026-08-19", kg: 84.2 },
    { date: "2026-08-22", kg: 83.8 },
  ],
  height: "178",
  profileAge: "47",
  profileSex: "m",
  mobility: [true, false, true, false, false],
  events: [
    { date: "2026-08-21", type: "Walk", min: 35, hr: 118, dist: 3.2 },
    { date: "2026-08-22", type: "Workout", min: 45, hr: "", dist: "" },
  ],
  mealIdx: { breakfast: 2, dinner: 1 },
};

describe("legacy import", () => {
  it("carries the settings across", () => {
    const p = planLegacyImport(blob, USER, newId).profilePatch;
    expect(p).toMatchObject({
      goal: "fat",
      muscles: ["legs", "core"],
      level: "advanced",
      kit: "bw",
      session_len: 45,
      pref_time: "evening",
      dietary: ["gf", "nf"],
      injuries: ["knee"],
      height_cm: 178,
      age: 47,
      sex: "m",
    });
    expect(p.avail_days).toEqual([0, 2, 4]);
    expect(p.mobility).toEqual([true, false, true, false, false]);
  });

  it("does NOT carry the disclaimer acceptance across", () => {
    // A boolean in a browser is not evidence that a person accepted a specific
    // version of the terms. Migrated users accept again, against their account.
    const p = planLegacyImport(blob, USER, newId).profilePatch;
    expect(p).not.toHaveProperty("disclaimer_accepted_at");
    expect(p).not.toHaveProperty("disclaimer_version");
    expect(p).not.toHaveProperty("intake_completed_at");
  });

  it("brings rows over with the user attached", () => {
    const r = planLegacyImport(blob, USER, newId);
    expect(r.checkins).toHaveLength(1);
    expect(r.weights).toHaveLength(2);
    expect(r.hydration).toHaveLength(1);
    expect(r.events).toHaveLength(2);
    for (const row of [...r.checkins, ...r.weights, ...r.hydration, ...r.events]) {
      expect(row.user_id).toBe(USER);
    }
  });

  it("gives every event a distinct id so a retried flush cannot duplicate it", () => {
    const r = planLegacyImport(blob, USER, newId);
    const ids = r.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps blank optional event fields to null rather than empty strings", () => {
    const r = planLegacyImport(blob, USER, newId);
    const workout = r.events.find((e) => e.type === "Workout")!;
    expect(workout.avg_hr).toBeNull();
    expect(workout.distance_km).toBeNull();
  });

  it("keeps the old `hrm` device flag as the renamed iPhone slot", () => {
    expect(planLegacyImport(blob, USER, newId).ui.devices.ios).toBe(true);
  });

  it("preserves meal swap positions", () => {
    expect(planLegacyImport(blob, USER, newId).ui.mealIdx).toEqual({
      breakfast: 2,
      dinner: 1,
    });
  });
});

describe("legacy import hardens against a corrupt blob", () => {
  // Every row here would violate a CHECK constraint. One of them reaching the
  // outbox would fail its upsert and block every write behind it.
  const corrupt = {
    settings: {
      goal: "wizard",
      muscles: ["legs", "tail"],
      level: 7,
      kit: null,
      len: 33,
      availDays: [1, 9, -2, "3"],
      prefTime: "midnight",
      dietary: ["gf", "vegan"],
      injuries: ["knee", "soul"],
    },
    checkins: [
      { date: "not-a-date", sleep: 3, stress: 3, energy: 3 },
      { date: "2026-08-20", sleep: 99, stress: -4, energy: null },
    ],
    weights: [
      { date: "2026-08-20", kg: 4000 },
      { date: "2026-08-21", kg: 80 },
    ],
    hydro: { date: "2026-08-23", ml: 9_000_000 },
    height: "1780",
    profileAge: "999",
    profileSex: "yes",
    mobility: [true],
    events: [
      { date: "2026-08-20", type: "Jousting", min: 30 },
      { date: "2026-08-20", type: "Walk", min: 0 },
      { date: "2026-08-20", type: "Walk", min: 20, hr: 900, dist: -5 },
    ],
  };

  it("clamps or drops everything a constraint would reject", () => {
    const r = planLegacyImport(corrupt, USER, newId);

    expect(r.profilePatch.goal).toBe("general");
    expect(r.profilePatch.muscles).toEqual(["legs"]);
    expect(r.profilePatch.level).toBe("intermediate");
    expect(r.profilePatch.kit).toBe("dbbw");
    expect(r.profilePatch.session_len).toBe(30);
    expect(r.profilePatch.avail_days).toEqual([1, 3]);
    expect(r.profilePatch.pref_time).toBe("morning");
    expect(r.profilePatch.dietary).toEqual(["gf"]);
    expect(r.profilePatch.injuries).toEqual(["knee"]);
    expect(r.profilePatch.height_cm).toBeNull();
    expect(r.profilePatch.age).toBeNull();
    expect(r.profilePatch.sex).toBeNull();
    expect(r.profilePatch.mobility).toEqual([true, false, false, false, false]);

    expect(r.checkins).toHaveLength(1);
    expect(r.checkins[0]).toMatchObject({ sleep: 5, stress: 1, energy: 3 });

    expect(r.weights).toHaveLength(1);
    expect(r.weights[0].kg).toBe(80);

    expect(r.hydration).toHaveLength(0);

    // "Jousting" is unknown but the session was real: it becomes Other sport.
    // The zero-minute row cannot be repaired and is dropped.
    expect(r.events.map((e) => e.type)).toEqual(["Other sport", "Walk"]);
    const walk = r.events[1];
    expect(walk.avg_hr).toBeNull();
    expect(walk.distance_km).toBeNull();

    expect(r.dropped).toMatchObject({ checkins: 1, weights: 1, events: 1 });
  });

  it("keeps only the last weigh-in for a date, since the key is (user, date)", () => {
    const r = planLegacyImport(
      {
        weights: [
          { date: "2026-08-20", kg: 80 },
          { date: "2026-08-20", kg: 81 },
          { date: "2026-08-21", kg: 82 },
        ],
      },
      USER,
      newId,
    );
    expect(r.weights).toEqual([
      { user_id: USER, date: "2026-08-20", kg: 81, source: "manual" },
      { user_id: USER, date: "2026-08-21", kg: 82, source: "manual" },
    ]);
  });

  it("survives junk in place of the whole blob", () => {
    for (const junk of [null, undefined, 42, "nope", [], { settings: 5 }]) {
      const r = planLegacyImport(junk, USER, newId);
      expect(r.profilePatch.goal).toBe("general");
      expect(r.profilePatch.avail_days).toEqual([1, 3, 5]);
      expect(r.events).toEqual([]);
    }
  });

  it("falls back to the default schedule rather than an empty one", () => {
    // Zero training days would generate a plan with no sessions in it.
    const r = planLegacyImport({ settings: { availDays: [] } }, USER, newId);
    expect(r.profilePatch.avail_days).toEqual([1, 3, 5]);
  });
});
