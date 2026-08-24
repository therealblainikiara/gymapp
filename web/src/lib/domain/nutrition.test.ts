import { describe, expect, it } from "vitest";
import { bodyReadout, dailyTargets } from "./nutrition";
import { GOALS } from "./goals";
import type { BoneHealth, MenopauseStage } from "@/lib/types/database";

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

describe("C24 — declarations move the targets", () => {
  const declaring = (
    d: Partial<{ menopause_stage: MenopauseStage | null; bone_health: BoneHealth | null }>,
  ) =>
    dailyTargets({
      ...complete,
      declarations: { menopause_stage: null, bone_health: null, ...d },
    });

  it("changes nothing when nothing is declared", () => {
    // The accept criterion: the existing Mifflin-St Jeor tests pass unchanged.
    const plain = dailyTargets(complete);
    expect(plain.protein).toBe(135);
    expect(plain.micros).toEqual([]);
    expect(plain.proteinNote).toBeNull();
    expect(declaring({}).protein).toBe(plain.protein);
  });

  it("raises protein to 2.0 g/kg on a declaration, not on a birthday", () => {
    // The plan said "1.6 → 2.0 for 45+". The fixture is 47 and must still get
    // 135, so age cannot be the trigger — and rule 1 says it should not be.
    expect(complete.ageYears).toBeGreaterThanOrEqual(45);
    expect(dailyTargets(complete).protein).toBe(135);
    for (const d of [
      { menopause_stage: "peri" as const },
      { menopause_stage: "post" as const },
      { bone_health: "osteopenia" as const },
      { bone_health: "osteoporosis" as const },
    ]) {
      expect(declaring(d).protein, JSON.stringify(d)).toBe(170); // 84 × 2.0
    }
  });

  it("leaves protein alone for answers that are not declarations", () => {
    for (const d of [
      { menopause_stage: "pre" as const },
      { menopause_stage: "undisclosed" as const },
      { bone_health: "none" as const },
      { bone_health: "untested" as const },
    ]) {
      expect(declaring(d).protein, JSON.stringify(d)).toBe(135);
      expect(declaring(d).micros).toEqual([]);
    }
  });

  it("says why the protein moved", () => {
    const note = declaring({ menopause_stage: "peri" }).proteinNote;
    expect(note).toContain("2.0 g/kg");
    expect(note).toContain("30 g a meal");
  });

  it("keeps the goal's own protein when a goal already raised it", () => {
    // Fat loss runs 1.8; a declaration takes it to 2.0 rather than stacking.
    const fatLoss = dailyTargets({ ...complete, goal: "fat" });
    expect(fatLoss.protein).toBe(150); // 84 × 1.8
    expect(
      dailyTargets({
        ...complete,
        goal: "fat",
        declarations: { menopause_stage: "peri", bone_health: null },
      }).protein,
    ).toBe(170);
  });

  it("adds calcium and vitamin D for menopause or low bone density", () => {
    for (const d of [
      { menopause_stage: "post" as const },
      { bone_health: "osteoporosis" as const },
    ]) {
      const ids = declaring(d).micros.map((m) => m.id);
      expect(ids, JSON.stringify(d)).toContain("calcium");
      expect(ids, JSON.stringify(d)).toContain("vitamin_d");
    }
  });

  it("flags iron for perimenopause only", () => {
    // After the last period the loss stops. Carrying the flag forward would
    // have people supplementing iron they no longer lose.
    expect(
      declaring({ menopause_stage: "peri" }).micros.map((m) => m.id),
    ).toContain("iron");
    expect(
      declaring({ menopause_stage: "post" }).micros.map((m) => m.id),
    ).not.toContain("iron");
  });

  it("never tells anyone a dose to go and buy", () => {
    // Calcium interacts with common medications; iron is toxic in excess and
    // its symptoms overlap with deficiency. Every one of these has to point at
    // food or at a test.
    for (const m of declaring({ menopause_stage: "peri" }).micros) {
      expect(m.foods.length, m.id).toBeGreaterThan(2);
      expect(m.why.length, m.id).toBeGreaterThan(40);
    }
    const iron = declaring({ menopause_stage: "peri" }).micros.find(
      (m) => m.id === "iron",
    )!;
    expect(iron.amount).toContain("test");
    expect(iron.amount).not.toMatch(/\d+\s*mg/);
  });

  it("still shows micros before the profile is complete", () => {
    // Height and weight gate the arithmetic, not the advice.
    const t = dailyTargets({
      ...complete,
      latestKg: null,
      declarations: { menopause_stage: "peri", bone_health: null },
    });
    expect(t.personalised).toBe(false);
    expect(t.micros.length).toBe(3);
  });
});
