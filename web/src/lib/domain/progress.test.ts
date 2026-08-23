import { describe, expect, it } from "vitest";
import { activeDaySet, scaleSpark, streakFrom, weightSpark } from "./progress";
import { dateKey, shiftDays, today, weekKeys, weekStart } from "./dates";

const NOW = new Date(2026, 7, 23, 9, 30); // Sunday 23 Aug 2026, local time

describe("streak", () => {
  it("is zero with nothing logged", () => {
    expect(streakFrom(new Set(), NOW)).toBe(0);
  });

  it("counts today plus the run before it", () => {
    const days = new Set(["2026-08-23", "2026-08-22", "2026-08-21"]);
    expect(streakFrom(days, NOW)).toBe(3);
  });

  it("survives today not being logged yet", () => {
    // Mid-morning, before the user has checked in: yesterday's streak still
    // stands rather than resetting to zero.
    const days = new Set(["2026-08-22", "2026-08-21"]);
    expect(streakFrom(days, NOW)).toBe(2);
  });

  it("stops at the first gap", () => {
    const days = new Set(["2026-08-23", "2026-08-22", "2026-08-20"]);
    expect(streakFrom(days, NOW)).toBe(2);
  });

  it("ignores days after today", () => {
    const days = new Set(["2026-08-24", "2026-08-23"]);
    expect(streakFrom(days, NOW)).toBe(1);
  });

  it("counts check-ins as well as sessions", () => {
    // The user's rule from the tracking round: "Check-in counts too".
    const days = activeDaySet(["2026-08-23"], []);
    expect(streakFrom(days, NOW)).toBe(1);
  });

  it("does not double-count a day with both a check-in and a session", () => {
    const days = activeDaySet(["2026-08-23"], ["2026-08-23", "2026-08-23"]);
    expect(days.size).toBe(1);
    expect(streakFrom(days, NOW)).toBe(1);
  });

  it("crosses a month boundary", () => {
    const endOfMonth = new Date(2026, 8, 1); // 1 Sep 2026
    const days = new Set(["2026-09-01", "2026-08-31", "2026-08-30"]);
    expect(streakFrom(days, endOfMonth)).toBe(3);
  });
});

describe("week", () => {
  it("starts on Sunday", () => {
    // The user chose a Sunday week start; every weekly total depends on it.
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 7, 23 + i, 12);
      expect(weekStart(d).getDay()).toBe(0);
    }
  });

  it("keeps Saturday in the week that opened the Sunday before", () => {
    const saturday = new Date(2026, 7, 29, 12);
    expect(dateKey(weekStart(saturday))).toBe("2026-08-23");
  });

  it("moves on at the next Sunday", () => {
    const nextSunday = new Date(2026, 7, 30, 0, 1);
    expect(dateKey(weekStart(nextSunday))).toBe("2026-08-30");
  });

  it("produces seven consecutive keys", () => {
    const keys = weekKeys(NOW);
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe("2026-08-23");
    expect(keys[6]).toBe("2026-08-29");
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]).toBe(shiftDays(keys[i - 1], 1));
    }
  });

  it("formats today as a local date, not UTC", () => {
    // 23:30 local must still be the 23rd — a UTC key would roll it forward and
    // log the session on tomorrow's date.
    const lateEvening = new Date(2026, 7, 23, 23, 30);
    expect(today(lateEvening)).toBe("2026-08-23");
  });
});

describe("sparklines", () => {
  it("centres a single point instead of pinning it to the left edge", () => {
    const [x, y] = scaleSpark([3], 120, 34).split(",").map(Number);
    expect(x).toBe(60);
    // 34 - (3/5)(34-6) - 2
    expect(y).toBeCloseTo(15.2, 5);
  });

  it("spans the full width for a series", () => {
    const points = scaleSpark([1, 3, 5], 240, 60).split(" ");
    expect(points[0]).toMatch(/^0\.0,/);
    expect(points[2]).toMatch(/^240\.0,/);
  });

  it("puts a higher score higher on the chart", () => {
    const [low, high] = scaleSpark([1, 5], 100, 50)
      .split(" ")
      .map((p) => Number(p.split(",")[1]));
    expect(high).toBeLessThan(low);
  });

  it("does not divide by zero when every weight is identical", () => {
    const points = weightSpark([80, 80, 80]);
    expect(points).not.toContain("NaN");
  });

  it("returns nothing for an empty weight history", () => {
    expect(weightSpark([])).toBe("");
  });
});
