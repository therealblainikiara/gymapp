import { describe, expect, it } from "vitest";
import {
  asFunctionValue,
  changeLine,
  functionSeries,
  functionTest,
  FUNCTION_TESTS,
  type FunctionTestId,
} from "./function-tests";
import type { WeightRow } from "@/lib/types/database";

const USER = "11111111-1111-1111-1111-111111111111";

function row(date: string, patch: Partial<WeightRow> = {}): WeightRow {
  return {
    user_id: USER,
    date,
    kg: 84,
    source: "manual",
    waist_cm: null,
    grip_kg: null,
    sit_to_stand: null,
    balance_sec: null,
    ...patch,
  };
}

describe("the test library", () => {
  it("gives every test a protocol precise enough to repeat", () => {
    for (const t of FUNCTION_TESTS) {
      expect(t.protocol.length, `${t.id} protocol`).toBeGreaterThan(2);
      expect(t.why, `${t.id} why`).toBeTruthy();
      expect(t.unit, `${t.id} unit`).toBeTruthy();
      expect(t.max, `${t.id} bounds`).toBeGreaterThan(t.min);
    }
  });

  it("hands out no verdicts, bands or comparisons", () => {
    // The Progress screen already refuses BMI categories. Published norms for
    // these are stratified by age and sex, so a verdict would mean telling a
    // 55-year-old she is "below average" — a clinical judgement this app is
    // not qualified to make and a demotivating one to be wrong about.
    const text = FUNCTION_TESTS.flatMap((t) => [t.why, ...t.protocol]).join(" ");
    for (const word of [
      "average",
      "normal",
      "below",
      "poor",
      "percentile",
      "for your age",
    ]) {
      expect(text.toLowerCase(), `mentions "${word}"`).not.toContain(word);
    }
  });

  it("has unique ids that match the column names", () => {
    const ids = FUNCTION_TESTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The ids are used as WeightRow keys directly, so a typo would silently
    // read undefined rather than failing.
    const sample = row("2026-08-24");
    for (const id of ids) expect(id in sample, id).toBe(true);
  });
});

describe("validation mirrors the CHECK constraints", () => {
  it("accepts plausible readings", () => {
    expect(asFunctionValue("grip_kg", 38.5)).toBe(38.5);
    expect(asFunctionValue("sit_to_stand", 14)).toBe(14);
    expect(asFunctionValue("balance_sec", 45)).toBe(45);
    expect(asFunctionValue("grip_kg", "38.5")).toBe(38.5);
  });

  it("rejects anything the database would", () => {
    // A rejected write stalls every queued write behind it, so this is the
    // last line before the outbox.
    expect(asFunctionValue("grip_kg", 900)).toBeNull();
    expect(asFunctionValue("grip_kg", 0)).toBeNull();
    expect(asFunctionValue("sit_to_stand", 61)).toBeNull();
    expect(asFunctionValue("balance_sec", 301)).toBeNull();
    expect(asFunctionValue("balance_sec", -1)).toBeNull();
  });

  it("rejects junk rather than coercing it", () => {
    for (const junk of ["", "  ", "abc", null, undefined, {}, NaN, Infinity]) {
      expect(asFunctionValue("grip_kg", junk), String(junk)).toBeNull();
    }
  });

  it("rounds counts to whole numbers and grip to the half", () => {
    expect(asFunctionValue("sit_to_stand", 14.6)).toBe(15);
    expect(asFunctionValue("balance_sec", 45.4)).toBe(45);
    expect(asFunctionValue("grip_kg", 38.3)).toBe(38.5);
    expect(asFunctionValue("grip_kg", 38.1)).toBe(38);
  });

  it("keeps a zero that the constraint allows", () => {
    // Zero stands is a real and important reading. Only grip starts at 1,
    // because a zero there means the dynamometer was not squeezed.
    expect(asFunctionValue("sit_to_stand", 0)).toBe(0);
    expect(asFunctionValue("balance_sec", 0)).toBe(0);
    expect(functionTest("grip_kg").min).toBe(1);
  });
});

describe("series", () => {
  it("skips rows where the test was not taken", () => {
    // Logging a weight and no grip reading is the normal case. A zero would
    // draw a cliff on the chart that never happened.
    const s = functionSeries([
      row("2026-08-01", { grip_kg: 36 }),
      row("2026-08-08"),
      row("2026-08-15", { grip_kg: 38 }),
    ]).find((x) => x.test.id === "grip_kg")!;
    expect(s.points).toHaveLength(2);
    expect(s.points.map((p) => p.value)).toEqual([36, 38]);
  });

  it("sorts oldest first however the rows arrive", () => {
    const s = functionSeries([
      row("2026-08-15", { grip_kg: 38 }),
      row("2026-08-01", { grip_kg: 36 }),
    ]).find((x) => x.test.id === "grip_kg")!;
    expect(s.first).toBe(36);
    expect(s.latest).toBe(38);
    expect(s.change).toBe(2);
  });

  it("reports no change with a single reading", () => {
    const s = functionSeries([row("2026-08-01", { grip_kg: 36 })]).find(
      (x) => x.test.id === "grip_kg",
    )!;
    expect(s.latest).toBe(36);
    expect(s.change).toBeNull();
  });

  it("returns one series per test even with no rows at all", () => {
    const all = functionSeries([]);
    expect(all).toHaveLength(FUNCTION_TESTS.length);
    for (const s of all) {
      expect(s.points).toEqual([]);
      expect(s.latest).toBeNull();
      expect(s.change).toBeNull();
    }
  });

  it("does not mutate the rows it was given", () => {
    const rows = [row("2026-08-15"), row("2026-08-01")];
    functionSeries(rows);
    expect(rows.map((r) => r.date)).toEqual(["2026-08-15", "2026-08-01"]);
  });
});

describe("the change line", () => {
  const seriesFor = (values: (number | null)[]) =>
    functionSeries(
      values.map((v, i) => row(`2026-08-0${i + 1}`, { grip_kg: v })),
    ).find((x) => x.test.id === "grip_kg")!;

  it("says nothing has been measured when nothing has", () => {
    expect(changeLine(seriesFor([]))).toBe("Not measured yet.");
    expect(changeLine(seriesFor([null, null]))).toBe("Not measured yet.");
  });

  it("asks for a second reading before claiming a trend", () => {
    expect(changeLine(seriesFor([36]))).toContain("measure again");
  });

  it("names the direction and the size", () => {
    expect(changeLine(seriesFor([36, 40]))).toContain("up 4");
    expect(changeLine(seriesFor([40, 36]))).toContain("down 4");
    expect(changeLine(seriesFor([36, 36]))).toContain("Holding");
  });

  it("compares the user only to themselves", () => {
    const lines = [[36], [36, 40], [40, 36], [36, 36]].map((v) =>
      changeLine(seriesFor(v)),
    );
    for (const line of lines) {
      expect(line.toLowerCase()).not.toContain("average");
      expect(line.toLowerCase()).not.toContain("for your age");
    }
    expect(changeLine(seriesFor([36, 40]))).toContain("since you started");
  });
});

describe("every id round-trips through the row", () => {
  it("reads the value it wrote", () => {
    const values: Record<FunctionTestId, number> = {
      grip_kg: 38,
      sit_to_stand: 14,
      balance_sec: 45,
    };
    const all = functionSeries([row("2026-08-01", values)]);
    for (const s of all) {
      expect(s.latest, s.test.id).toBe(values[s.test.id]);
    }
  });
});
