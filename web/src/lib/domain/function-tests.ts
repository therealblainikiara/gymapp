import type { WeightRow } from "@/lib/types/database";

/**
 * M6 / C25 — the function tests.
 *
 * Grip strength, 30-second sit-to-stand and single-leg balance predict falls,
 * fractures, independence and all-cause mortality better than body weight does,
 * and unlike weight they respond to training in a direction the user can feel.
 *
 * **No verdicts, deliberately, and this is not a style choice.** The Progress
 * screen already refuses to hand out BMI categories — the user was explicit
 * about not calling everyone obese. The same reasoning applies harder here:
 * published norms for these tests are stratified by age and sex, so a verdict
 * would mean telling a 55-year-old woman she is "below average for her age",
 * which is a clinical judgement this app is not qualified to make and a
 * demotivating one to be wrong about.
 *
 * So each test states its protocol, and the screen shows the user's own numbers
 * over time. Your own trend is the comparison that matters and the only one we
 * can stand behind.
 */

export type FunctionTestId = "grip_kg" | "sit_to_stand" | "balance_sec";

export interface FunctionTest {
  id: FunctionTestId;
  label: string;
  unit: string;
  /** How to do it, precisely enough that two attempts are comparable. */
  protocol: string[];
  /** Why it is worth measuring. */
  why: string;
  /** Rejects typos, not performance — matches the database CHECK. */
  min: number;
  max: number;
  /** Whole numbers only for counts and seconds. */
  step: number;
}

export const FUNCTION_TESTS: FunctionTest[] = [
  {
    id: "grip_kg",
    label: "Grip strength",
    unit: "kg",
    protocol: [
      "Hand dynamometer, elbow at 90° and tucked in",
      "Squeeze hard for three seconds",
      "Best of three on your dominant hand, one minute between",
    ],
    why: "The cheapest proxy for whole-body strength there is, and the one that tracks independence in later life most closely.",
    min: 1,
    max: 120,
    step: 0.5,
  },
  {
    id: "sit_to_stand",
    label: "30-second sit-to-stand",
    unit: "stands",
    protocol: [
      "Standard chair against a wall, arms crossed on the chest",
      "Full stand, full sit, as many as you can in 30 seconds",
      "Count a stand only if the legs straighten",
    ],
    why: "Leg power and the exact movement that gets you off a chair, a toilet and the floor. It falls before anything else does.",
    min: 0,
    max: 60,
    step: 1,
  },
  {
    id: "balance_sec",
    label: "Single-leg balance",
    unit: "s",
    protocol: [
      "Eyes open, hands on hips, near a wall you can reach",
      "Stop the clock when the foot lands or a hand touches",
      "Best of two on your weaker side",
    ],
    why: "Balance is the difference between a stumble and a fracture, and it is trainable at any age.",
    min: 0,
    max: 300,
    step: 1,
  },
];

const BY_ID = new Map(FUNCTION_TESTS.map((t) => [t.id, t]));

export function functionTest(id: FunctionTestId): FunctionTest {
  return BY_ID.get(id)!;
}

/**
 * Validate a typed value against the same bounds the database enforces.
 *
 * A write the database rejects stalls every queued write behind it, so nothing
 * reaches the outbox without passing through here. Returns null for anything
 * unusable, which the caller treats as "not measured today".
 */
export function asFunctionValue(
  id: FunctionTestId,
  raw: unknown,
): number | null {
  const t = functionTest(id);
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n)) return null;
  if (n < t.min || n > t.max) return null;
  return t.step === 1 ? Math.round(n) : Math.round(n * 2) / 2;
}

export interface FunctionSeries {
  test: FunctionTest;
  /** Oldest first, only the dates where this test was actually taken. */
  points: { date: string; value: number }[];
  latest: number | null;
  first: number | null;
  /** Latest minus first, or null with fewer than two readings. */
  change: number | null;
}

/**
 * One series per test, built from the measurement rows.
 *
 * Rows without a reading for a given test are skipped rather than treated as
 * zero — logging a weight and no grip reading is the normal case, and a zero
 * would draw a cliff on the chart that never happened.
 */
export function functionSeries(rows: WeightRow[]): FunctionSeries[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return FUNCTION_TESTS.map((test) => {
    const points = sorted
      .map((r) => ({ date: r.date, value: r[test.id] }))
      .filter((p): p is { date: string; value: number } => p.value != null);
    const first = points[0]?.value ?? null;
    const latest = points[points.length - 1]?.value ?? null;
    return {
      test,
      points,
      latest,
      first,
      change:
        points.length > 1 && first !== null && latest !== null
          ? Math.round((latest - first) * 10) / 10
          : null,
    };
  });
}

/**
 * The change, phrased for the user — never a comparison to anyone else.
 *
 * All three tests are "up is better", which is worth stating rather than
 * assuming: it is why this can be one function instead of three.
 */
export function changeLine(s: FunctionSeries): string {
  if (s.latest === null) return "Not measured yet.";
  if (s.change === null) {
    return `${s.latest} ${s.test.unit} — measure again in a month to see a trend.`;
  }
  if (s.change === 0) return `Holding at ${s.latest} ${s.test.unit}.`;
  const dir = s.change > 0 ? "up" : "down";
  return `${s.latest} ${s.test.unit} — ${dir} ${Math.abs(s.change)} since you started.`;
}
