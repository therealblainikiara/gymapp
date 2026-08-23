import { dateKey } from "./dates";

/**
 * Streak, sparklines and the derived counters the Progress and Home screens
 * read. Everything here is computed from stored rows rather than kept as its
 * own counter — the prototype held a `sessions` number and an `activity` date
 * list alongside the events that produced them, which is two sources of truth
 * to keep in step across two devices.
 */

/**
 * Consecutive days ending today (or yesterday, if today is not logged yet) on
 * which the user did anything at all. Check-ins count — that was the user's
 * decision in the tracking-rules round.
 */
export function streakFrom(activeDays: Set<string>, now: Date = new Date()): number {
  const d = new Date(now);
  if (!activeDays.has(dateKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  for (;;) {
    if (!activeDays.has(dateKey(d))) break;
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Every date on which the user checked in or logged an activity. */
export function activeDaySet(
  checkinDates: string[],
  eventDates: string[],
): Set<string> {
  return new Set([...checkinDates, ...eventDates]);
}

/**
 * SVG polyline points for a 1–5 scale series, matching the prototype's
 * geometry so the charts render identically.
 */
export function scaleSpark(
  values: number[],
  width: number,
  height: number,
): string {
  return values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : (i * width) / (values.length - 1);
      const y = height - (v / 5) * (height - 6) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Weight sparkline: auto-scaled to the logged range, as in the prototype. */
export function weightSpark(kgs: number[]): string {
  if (!kgs.length) return "";
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const rng = max - min || 1;
  return kgs
    .map((kg, i) => {
      const x = kgs.length === 1 ? 120 : (i * 240) / (kgs.length - 1);
      const y = 56 - ((kg - min) / rng) * 48;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
