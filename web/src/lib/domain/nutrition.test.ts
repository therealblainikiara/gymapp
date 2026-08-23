import { describe, expect, it } from "vitest";
import { bodyReadout, dailyTargets } from "./nutrition";
import { GOALS } from "./goals";

const complete = {
  goal: "general" as const,
  dietary: [],
  heightCm: 178,
  ageYears: 47,
  sex: "m" as const,
  latestKg: 84,
};

describe("daily targets", () => {
  it("falls back to goal defaults until the profile is complete", () => {
    const t = dailyTargets({ ...complete, latestKg: null });
    expect(t.personalised).toBe(false);
    expect(t.kcal).toBe(GOALS.general.kcal);
    expect(t.note).toMatch(/Goal defaults/);
  });

  it.each([
    ["no height", { heightCm: null }],
    ["no age", { ageYears: null }],
    ["implausible height", { heightCm: 40 }],
    ["a child's age", { ageYears: 11 }],
  ])("stays on defaults with %s", (_label, patch) => {
    expect(dailyTargets({ ...complete, ...patch }).personalised).toBe(false);
  });

  it("personalises once weight, height and age are all present", () => {
    const t = dailyTargets(complete);
    expect(t.personalised).toBe(true);
    expect(t.note).toContain("Mifflin-St Jeor");
    // BMR 10*84 + 6.25*178 - 5*47 + 5 = 1722.5 → ×1.45 ×1.0 = 2497.6 → 2500
    expect(t.kcal).toBe(2500);
    expect(t.protein).toBe(135); // 84 × 1.6 = 134.4, rounded to the nearest 5
  });

  it("moves when the logged weight moves", () => {
    const light = dailyTargets({ ...complete, latestKg: 70 });
    const heavy = dailyTargets({ ...complete, latestKg: 100 });
    expect(heavy.kcal).toBeGreaterThan(light.kcal);
    expect(heavy.protein).toBeGreaterThan(light.protein);
  });

  it("uses the female BMR constant", () => {
    const male = dailyTargets({ ...complete, sex: "m" });
    const female = dailyTargets({ ...complete, sex: "f" });
    expect(female.kcal).toBeLessThan(male.kcal);
  });

  it("cuts for fat loss and raises protein", () => {
    const general = dailyTargets(complete);
    const fatLoss = dailyTargets({ ...complete, goal: "fat" });
    expect(fatLoss.kcal).toBeLessThan(general.kcal);
    expect(fatLoss.protein).toBeGreaterThan(general.protein);
  });

  it("applies the vegetarian adjustment", () => {
    const plain = dailyTargets(complete);
    const veg = dailyTargets({ ...complete, dietary: ["veg"] });
    expect(veg.kcal).toBe(plain.kcal - 100);
  });

  it("never produces negative carbs", () => {
    // A very light, very short person on a fat-loss goal is where protein and
    // fat could otherwise eat the whole budget.
    const t = dailyTargets({
      ...complete,
      goal: "fat",
      heightCm: 140,
      latestKg: 45,
      ageYears: 80,
      sex: "f",
    });
    expect(t.carbs).toBeGreaterThanOrEqual(0);
  });
});

describe("body readout", () => {
  it("asks for a height before saying anything", () => {
    const r = bodyReadout(null, 84);
    expect(r.hasBmi).toBe(false);
    expect(r.rangeLine).toMatch(/Enter your height/);
  });

  it("shows a range from height alone", () => {
    const r = bodyReadout(178, null);
    expect(r.hasBmi).toBe(false);
    expect(r.rangeLine).toContain("Suggested range for 178 cm");
  });

  it("computes BMI once a weight is logged", () => {
    const r = bodyReadout(178, 84);
    expect(r.hasBmi).toBe(true);
    expect(r.bmiLine).toContain("26.5");
  });

  it("never returns a weight category verdict", () => {
    // The user's instruction was explicit: BMI, but do "not call everyone
    // obese". No categorisation vocabulary is allowed in this copy.
    const banned = /obese|obesity|overweight|underweight|normal weight|healthy weight range/i;
    for (const kg of [45, 60, 84, 110, 150]) {
      const r = bodyReadout(178, kg);
      expect(r.bmiLine).not.toMatch(banned);
      expect(r.rangeLine).not.toMatch(banned);
    }
  });

  it("frames the range as a span rather than a target", () => {
    expect(bodyReadout(178, 84).rangeLine).toContain("not a target");
  });
});
