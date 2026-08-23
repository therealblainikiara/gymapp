import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  CheckinRow,
  EventRow,
  FriendshipRow,
  HydrationRow,
  ProfileRow,
  WeightRow,
} from "@/lib/types/database";

/**
 * The write-through cache. The UI reads from here and only from here — the
 * network is an background detail, and the app is fully usable offline.
 *
 * One database per user (`gymapp:<uid>`) rather than a user_id column on every
 * row. Two accounts on a shared browser then cannot see each other's cached
 * data even momentarily, and signing out is a single deleteDatabase call.
 */

export type SyncTable =
  | "profiles"
  | "events"
  | "checkins"
  | "weights"
  | "hydration"
  | "friendships";

export interface OutboxOp {
  seq?: number;
  table: SyncTable;
  op: "upsert" | "delete";
  /** Identifies the row this op targets, for coalescing and merge decisions. */
  key: string;
  payload: Record<string, unknown>;
  client_ts: string;
  attempts: number;
  last_error?: string;
}

/** Purely local preferences that have no column in the schema. */
export interface UiState {
  /** Which alternative each meal slot is currently showing (the Swap button). */
  mealIdx: Record<string, number>;
  /**
   * Simulated device pairing. Real Health Connect / HealthKit reads need a
   * native wrapper — M4 — so these flags never leave the device.
   */
  devices: Record<string, boolean>;
}

export const EMPTY_UI: UiState = { mealIdx: {}, devices: {} };

interface GymDB extends DBSchema {
  meta: { key: string; value: { k: string; v: unknown } };
  ui: { key: string; value: { k: string; v: unknown } };
  profile: { key: string; value: ProfileRow };
  events: { key: string; value: EventRow; indexes: { date: string } };
  checkins: { key: string; value: CheckinRow };
  weights: { key: string; value: WeightRow };
  hydration: { key: string; value: HydrationRow };
  friendships: { key: string; value: FriendshipRow & { key: string } };
  outbox: { key: number; value: OutboxOp };
}

export type GymDatabase = IDBPDatabase<GymDB>;

export function friendshipKey(r: { requester: string; addressee: string }) {
  return `${r.requester}|${r.addressee}`;
}

export function dbName(userId: string) {
  return `gymapp:${userId}`;
}

export function openLocalDb(userId: string): Promise<GymDatabase> {
  return openDB<GymDB>(dbName(userId), 1, {
    upgrade(db) {
      db.createObjectStore("meta", { keyPath: "k" });
      db.createObjectStore("ui", { keyPath: "k" });
      db.createObjectStore("profile", { keyPath: "id" });
      const events = db.createObjectStore("events", { keyPath: "id" });
      events.createIndex("date", "date");
      db.createObjectStore("checkins", { keyPath: "date" });
      db.createObjectStore("weights", { keyPath: "date" });
      db.createObjectStore("hydration", { keyPath: "date" });
      db.createObjectStore("friendships", { keyPath: "key" });
      db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
    },
  });
}

export async function readMeta<T>(
  db: GymDatabase,
  key: string,
): Promise<T | undefined> {
  return (await db.get("meta", key))?.v as T | undefined;
}

export async function writeMeta(db: GymDatabase, key: string, v: unknown) {
  await db.put("meta", { k: key, v });
}

export async function readUi(db: GymDatabase): Promise<UiState> {
  const stored = (await db.get("ui", "state"))?.v as UiState | undefined;
  return { ...EMPTY_UI, ...(stored ?? {}) };
}

export async function writeUi(db: GymDatabase, ui: UiState) {
  await db.put("ui", { k: "state", v: ui });
}

/** The whole cache, as the store holds it in memory. */
export interface LocalSnapshot {
  profile: ProfileRow | null;
  events: EventRow[];
  checkins: CheckinRow[];
  weights: WeightRow[];
  hydration: HydrationRow[];
  friendships: FriendshipRow[];
  ui: UiState;
}

export async function readAll(
  db: GymDatabase,
  userId: string,
): Promise<LocalSnapshot> {
  const [profile, events, checkins, weights, hydration, friendships, ui] =
    await Promise.all([
      db.get("profile", userId),
      db.getAll("events"),
      db.getAll("checkins"),
      db.getAll("weights"),
      db.getAll("hydration"),
      db.getAll("friendships"),
      readUi(db),
    ]);
  return {
    profile: profile ?? null,
    events: events.sort((a, b) => a.date.localeCompare(b.date)),
    checkins: checkins.sort((a, b) => a.date.localeCompare(b.date)),
    weights: weights.sort((a, b) => a.date.localeCompare(b.date)),
    hydration,
    friendships,
    ui,
  };
}
