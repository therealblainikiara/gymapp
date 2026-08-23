/**
 * Date helpers. The app's week starts on Sunday (user decision, intake round 6)
 * and every date is a local-time `YYYY-MM-DD` key — the same shape the
 * prototype persisted, and the shape Postgres `date` columns round-trip.
 *
 * Deliberately local, not UTC: a session logged at 22:00 belongs to that
 * evening, not to tomorrow.
 */

export const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export function dateKey(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function today(now: Date = new Date()): string {
  return dateKey(now);
}

/** The Sunday that opens the week containing `now`. */
export function weekStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** The seven `YYYY-MM-DD` keys of the current Sunday-start week. */
export function weekKeys(now: Date = new Date()): string[] {
  const sunday = weekStart(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return dateKey(d);
  });
}

export function shiftDays(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return dateKey(dt);
}

export function todayLabel(now: Date = new Date()): string {
  return `${DAY_NAMES[now.getDay()]} ${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`;
}

export function clock(totalSeconds: number): string {
  return (
    Math.floor(totalSeconds / 60) +
    ":" +
    String(totalSeconds % 60).padStart(2, "0")
  );
}
