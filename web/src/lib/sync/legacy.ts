import type {
  CheckinRow,
  DietaryKey,
  EventRow,
  EventType,
  Goal,
  HydrationRow,
  InjuryKey,
  Kit,
  Level,
  MuscleKey,
  PrefTime,
  ProfileRow,
  SessionLen,
  WeightRow,
} from "@/lib/types/database";
import type { UiState } from "@/lib/local/db";

/**
 * One-shot import of the prototype's browser data.
 *
 * The prototype stored everything under the localStorage key `gymapp_v2`. On
 * first sign-in we lift it into the account, then mark it migrated and leave
 * the original blob alone — deleting it would make an accidental re-import
 * unrecoverable, and it is a few kilobytes.
 *
 * Everything is validated on the way through. The blob is untrusted input: it
 * has been edited by hand, half-written by a crashed tab, and carries fields
 * from versions of the prototype that no longer exist. One row that violates a
 * CHECK constraint would fail its upsert and wedge the outbox behind it
 * forever, so anything that cannot be repaired is dropped and counted.
 */

export const LEGACY_KEY = "gymapp_v2";
export const MIGRATED_META_KEY = "legacy_migrated_at";

const GOALS: Goal[] = ["muscle", "fat", "strength", "endurance", "general"];
const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
const KITS: Kit[] = ["bw", "dbbw"];
const PREF_TIMES: PrefTime[] = ["morning", "lunch", "evening"];
const LENGTHS: SessionLen[] = [10, 20, 30, 45, 60];
const MUSCLES: MuscleKey[] = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "arms",
  "core",
  "full",
];
const DIETARY: DietaryKey[] = ["veg", "lf", "gf", "nf"];
const INJURIES: InjuryKey[] = ["knee", "shoulder", "back", "wrist"];
const EVENT_TYPES: EventType[] = [
  "Workout",
  "Walk",
  "Ride",
  "Run",
  "Swim",
  "Squash",
  "Tennis",
  "Other sport",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string | number>(
  value: unknown,
  allowed: T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function subsetOf<T extends string>(value: unknown, allowed: T[]): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is T => allowed.includes(v as T)))];
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

function inRange(value: unknown, lo: number, hi: number): number | null {
  const n = num(value);
  return n !== null && n >= lo && n <= hi ? n : null;
}

function validDate(value: unknown): string | null {
  return typeof value === "string" && DATE_RE.test(value) ? value : null;
}

function clamp5(value: unknown): number {
  const n = num(value) ?? 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export interface LegacyImport {
  profilePatch: Partial<ProfileRow>;
  checkins: CheckinRow[];
  weights: WeightRow[];
  hydration: HydrationRow[];
  events: EventRow[];
  ui: UiState;
  /** Rows that could not be repaired, by table, for the migration report. */
  dropped: Record<string, number>;
}

export function readLegacyBlob(storage: Storage = localStorage): unknown | null {
  try {
    const raw = storage.getItem(LEGACY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Translate the prototype blob into rows.
 *
 * Note what is deliberately *not* carried over: `accepted` and `onboardDone`.
 * A boolean in a browser is not evidence that a particular person accepted a
 * particular version of the disclaimer, and that record is the whole point of
 * `disclaimer_accepted_at`. Migrated users see the disclaimer once more and
 * accept it against their account.
 */
export function planLegacyImport(
  blob: unknown,
  userId: string,
  newId: () => string,
): LegacyImport {
  const b = (blob ?? {}) as Record<string, unknown>;
  const settings = (b.settings ?? {}) as Record<string, unknown>;
  const dropped: Record<string, number> = {};
  const drop = (t: string) => {
    dropped[t] = (dropped[t] ?? 0) + 1;
  };

  const mobilityRaw = Array.isArray(b.mobility) ? b.mobility : [];
  const mobility = Array.from({ length: 5 }, (_, i) => mobilityRaw[i] === true);

  const availDays = Array.isArray(settings.availDays)
    ? [
        ...new Set(
          settings.availDays
            .map((d) => num(d))
            .filter((d): d is number => d !== null && d >= 0 && d <= 6)
            .map(Math.trunc),
        ),
      ].sort((a, b2) => a - b2)
    : [];

  const profilePatch: Partial<ProfileRow> = {
    goal: oneOf(settings.goal, GOALS, "general"),
    muscles: subsetOf(settings.muscles, MUSCLES),
    level: oneOf(settings.level, LEVELS, "intermediate"),
    kit: oneOf(settings.kit, KITS, "dbbw"),
    session_len: oneOf(num(settings.len), LENGTHS, 30),
    // An empty schedule would generate a plan with no days; the prototype's
    // own default is the right thing to fall back to.
    avail_days: availDays.length ? availDays : [1, 3, 5],
    pref_time: oneOf(settings.prefTime, PREF_TIMES, "morning"),
    dietary: subsetOf(settings.dietary, DIETARY),
    injuries: subsetOf(settings.injuries, INJURIES),
    height_cm: inRange(b.height, 100, 250),
    age: inRange(b.profileAge, 13, 120),
    sex: b.profileSex === "f" ? "f" : b.profileSex === "m" ? "m" : null,
    mobility,
  };

  const checkins: CheckinRow[] = [];
  for (const raw of Array.isArray(b.checkins) ? b.checkins : []) {
    const c = raw as Record<string, unknown>;
    const date = validDate(c.date);
    if (!date) {
      drop("checkins");
      continue;
    }
    checkins.push({
      user_id: userId,
      date,
      sleep: clamp5(c.sleep),
      stress: clamp5(c.stress),
      energy: clamp5(c.energy),
    });
  }

  const weights: WeightRow[] = [];
  const seenWeightDates = new Set<string>();
  for (const raw of Array.isArray(b.weights) ? b.weights : []) {
    const w = raw as Record<string, unknown>;
    const date = validDate(w.date);
    const kg = inRange(w.kg, 20, 300);
    if (!date || kg === null) {
      drop("weights");
      continue;
    }
    // The prototype allowed several weigh-ins on one date; the table keys on
    // (user_id, date), so the last one for a date is the one that survives.
    if (seenWeightDates.has(date)) {
      weights[weights.findIndex((x) => x.date === date)] = {
        user_id: userId,
        date,
        kg,
        source: "manual",
      };
      continue;
    }
    seenWeightDates.add(date);
    weights.push({ user_id: userId, date, kg, source: "manual" });
  }

  const hydration: HydrationRow[] = [];
  const hydro = (b.hydro ?? {}) as Record<string, unknown>;
  const hydroDate = validDate(hydro.date);
  const hydroMl = inRange(hydro.ml, 0, 20000);
  if (hydroDate && hydroMl !== null) {
    hydration.push({ user_id: userId, date: hydroDate, ml: Math.round(hydroMl) });
  }

  const events: EventRow[] = [];
  for (const raw of Array.isArray(b.events) ? b.events : []) {
    const e = raw as Record<string, unknown>;
    const date = validDate(e.date);
    const minutes = inRange(e.min, 1, 1440);
    if (!date || minutes === null) {
      drop("events");
      continue;
    }
    events.push({
      id: newId(),
      user_id: userId,
      date,
      type: oneOf(e.type, EVENT_TYPES, "Other sport"),
      minutes: Math.round(minutes),
      avg_hr: inRange(e.hr, 20, 250),
      distance_km: (() => {
        const d = num(e.dist);
        return d !== null && d >= 0 ? d : null;
      })(),
      source: "manual",
      external_id: null,
      created_at: new Date().toISOString(),
    });
  }

  const mealIdxRaw = (b.mealIdx ?? {}) as Record<string, unknown>;
  const mealIdx: Record<string, number> = {};
  for (const slot of ["breakfast", "lunch", "dinner", "snack"]) {
    const n = num(mealIdxRaw[slot]);
    if (n !== null && n >= 0) mealIdx[slot] = Math.trunc(n);
  }

  const devicesRaw = (b.devices ?? {}) as Record<string, unknown>;
  const devices: Record<string, boolean> = {
    watch: devicesRaw.watch === true,
    phone: devicesRaw.phone === true,
    scale: devicesRaw.scale === true,
    // The iPhone/HealthKit slot was keyed `hrm` in earlier saves before the
    // rename; carry the old flag across rather than silently unpairing it.
    ios: devicesRaw.ios === true || devicesRaw.hrm === true,
  };

  return {
    profilePatch,
    checkins,
    weights,
    hydration,
    events,
    ui: { mealIdx, devices },
    dropped,
  };
}
