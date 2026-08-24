import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CheckinRow,
  Database,
  EventRow,
  EventType,
  FriendshipRow,
  HydrationRow,
  ProfileRow,
  WeightRow,
} from "@/lib/types/database";
import {
  EMPTY_UI,
  friendshipKey,
  openLocalDb,
  readAll,
  readMeta,
  writeMeta,
  writeUi,
  type GymDatabase,
  type LocalSnapshot,
  type UiState,
} from "./db";
import { enqueue, nowTs, outboxDepth } from "@/lib/sync/outbox";
import { push } from "@/lib/sync/push";
import { pull } from "@/lib/sync/pull";
import {
  LEGACY_KEY,
  MIGRATED_META_KEY,
  planLegacyImport,
  readLegacyBlob,
} from "@/lib/sync/legacy";
import { today } from "@/lib/domain/dates";

type Client = SupabaseClient<Database>;

export type SyncStatus = "loading" | "idle" | "syncing" | "offline" | "error";

export interface StoreSnapshot extends LocalSnapshot {
  userId: string;
  status: SyncStatus;
  pending: number;
  lastError: string | null;
  /** Set once the legacy import has run, with what it brought across. */
  legacyReport: { imported: number; dropped: Record<string, number> } | null;
}

const PUSH_DEBOUNCE_MS = 1_000;
const PUSH_INTERVAL_MS = 30_000;
const PULL_INTERVAL_MS = 5 * 60_000;

/** Matches the `mobility_len` CHECK constraint and MILESTONES in domain/recovery. */
const MILESTONE_COUNT = 5;

/**
 * The row the database would have created, used as the base for a patch made
 * before the first pull has landed. Kept in step with the column defaults in
 * supabase/migrations/20260823000100_init.sql.
 */
export function defaultProfile(userId: string): ProfileRow {
  const now = new Date().toISOString();
  return {
    id: userId,
    display_name: null,
    handle: null,
    goal: "general",
    muscles: [],
    level: "intermediate",
    kit: "dbbw",
    session_len: 30,
    avail_days: [1, 3, 5],
    pref_time: "morning",
    dietary: [],
    injuries: [],
    height_cm: null,
    age: null,
    sex: null,
    mobility: Array.from({ length: MILESTONE_COUNT }, () => false),
    // null, not a default — "not asked yet" has to stay distinguishable from
    // an answered "none", because they lead to different programming.
    menopause_stage: null,
    bone_health: null,
    pelvic_floor: null,
    conditions: [],
    clinician_cleared_at: null,
    disclaimer_accepted_at: null,
    disclaimer_version: null,
    intake_completed_at: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Flip one mobility milestone, always returning exactly MILESTONE_COUNT
 * booleans.
 *
 * The column is `CHECK (array_length(mobility, 1) = 5)`. Mapping over whatever
 * happens to be in the cache would produce a short array from an old save or
 * from a toggle made before the first pull — and that write would be rejected
 * by the database and stall every queued write behind it. Normalising is the
 * difference between a wrong checkbox and a stuck outbox.
 */
export function toggleMobility(
  current: boolean[] | undefined,
  index: number,
): boolean[] {
  const from = current ?? [];
  return Array.from({ length: MILESTONE_COUNT }, (_, i) =>
    i === index ? from[i] !== true : from[i] === true,
  );
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Deterministic-enough fallback for environments without WebCrypto.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * The single source of truth the screens read.
 *
 * Every mutation follows the same shape: update the in-memory snapshot, write
 * it to IndexedDB, append an outbox op, notify subscribers, and schedule a
 * flush. The UI re-renders from the local write immediately and never blocks
 * on the network — which is what makes the app usable on a phone in a gym
 * basement, and what makes the two-device gate converge rather than fight.
 */
export class GymStore {
  private snapshot: StoreSnapshot;
  private listeners = new Set<() => void>();
  private db: GymDatabase | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushInterval: ReturnType<typeof setInterval> | null = null;
  private pullInterval: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private disposed = false;

  constructor(
    readonly userId: string,
    private readonly supabase: Client,
  ) {
    this.snapshot = {
      userId,
      profile: null,
      events: [],
      checkins: [],
      weights: [],
      hydration: [],
      friendships: [],
      ui: EMPTY_UI,
      status: "loading",
      pending: 0,
      lastError: null,
      legacyReport: null,
    };
  }

  // ── React integration ────────────────────────────────────────────────────

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private emit(patch: Partial<StoreSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.db = await openLocalDb(this.userId);
    await this.runLegacyImport();
    await this.reloadFromCache();
    this.emit({ status: navigator.onLine ? "idle" : "offline" });

    void this.sync();

    this.pushInterval = setInterval(() => void this.flush(), PUSH_INTERVAL_MS);
    this.pullInterval = setInterval(() => void this.sync(), PULL_INTERVAL_MS);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  dispose() {
    this.disposed = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.pushInterval) clearInterval(this.pushInterval);
    if (this.pullInterval) clearInterval(this.pullInterval);
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.db?.close();
  }

  private onOnline = () => {
    this.emit({ status: "idle" });
    void this.sync();
  };
  private onOffline = () => this.emit({ status: "offline" });
  private onVisibility = () => {
    if (document.visibilityState === "visible") void this.sync();
  };

  private async reloadFromCache() {
    if (!this.db) return;
    const local = await readAll(this.db, this.userId);
    this.emit({ ...local, pending: await outboxDepth(this.db) });
  }

  // ── sync ─────────────────────────────────────────────────────────────────

  /** Push anything queued, then pull the server's view and merge it. */
  async sync(): Promise<void> {
    if (!this.db || this.disposed || !navigator.onLine) return;
    if (this.flushing) return;
    this.flushing = true;
    this.emit({ status: "syncing" });
    try {
      const pushed = await push(this.db, this.supabase, this.userId);
      const pulled = await pull(this.db, this.supabase, this.userId);
      await this.reloadFromCache();
      const error = pushed.error ?? pulled.error ?? null;
      this.emit({
        status: error ? "error" : navigator.onLine ? "idle" : "offline",
        lastError: error,
      });
    } finally {
      this.flushing = false;
    }
  }

  /** Push only — used by the debounce after a mutation. */
  private async flush(): Promise<void> {
    if (!this.db || this.disposed || !navigator.onLine) return;
    if (this.flushing) return;
    this.flushing = true;
    try {
      const result = await push(this.db, this.supabase, this.userId);
      this.emit({
        pending: await outboxDepth(this.db),
        lastError: result.error ?? null,
        status: result.failed ? "error" : "idle",
      });
      // A superseded profile patch means another device won; re-read so the
      // user sees the value that actually stuck rather than their stale one.
      if (result.superseded > 0) {
        await pull(this.db, this.supabase, this.userId);
        await this.reloadFromCache();
      }
    } finally {
      this.flushing = false;
    }
  }

  private scheduleFlush() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.flush(), PUSH_DEBOUNCE_MS);
  }

  // ── legacy import ────────────────────────────────────────────────────────

  private async runLegacyImport() {
    if (!this.db) return;
    if (await readMeta<string>(this.db, MIGRATED_META_KEY)) return;

    const blob = readLegacyBlob();
    if (!blob) {
      await writeMeta(this.db, MIGRATED_META_KEY, new Date().toISOString());
      return;
    }

    const plan = planLegacyImport(blob, this.userId, uuid);
    const ts = nowTs();

    await this.db.put("ui", { k: "state", v: plan.ui });
    for (const row of plan.checkins) await this.db.put("checkins", row);
    for (const row of plan.weights) await this.db.put("weights", row);
    for (const row of plan.hydration) await this.db.put("hydration", row);
    for (const row of plan.events) await this.db.put("events", row);

    await enqueue(this.db, {
      table: "profiles",
      op: "upsert",
      key: this.userId,
      payload: plan.profilePatch as Record<string, unknown>,
      client_ts: ts,
    });
    for (const row of plan.checkins) {
      await enqueue(this.db, {
        table: "checkins",
        op: "upsert",
        key: row.date,
        payload: row as unknown as Record<string, unknown>,
        client_ts: ts,
      });
    }
    for (const row of plan.weights) {
      await enqueue(this.db, {
        table: "weights",
        op: "upsert",
        key: row.date,
        payload: row as unknown as Record<string, unknown>,
        client_ts: ts,
      });
    }
    for (const row of plan.hydration) {
      await enqueue(this.db, {
        table: "hydration",
        op: "upsert",
        key: row.date,
        payload: row as unknown as Record<string, unknown>,
        client_ts: ts,
      });
    }
    for (const row of plan.events) {
      await enqueue(this.db, {
        table: "events",
        op: "upsert",
        key: row.id,
        payload: row as unknown as Record<string, unknown>,
        client_ts: ts,
      });
    }

    await writeMeta(this.db, MIGRATED_META_KEY, new Date().toISOString());
    // The original blob is left in place on purpose: an import that went wrong
    // is recoverable while it still exists, and it costs a few kilobytes.
    this.emit({
      legacyReport: {
        imported:
          plan.checkins.length +
          plan.weights.length +
          plan.hydration.length +
          plan.events.length,
        dropped: plan.dropped,
      },
    });
  }

  /** True when a prototype blob is present and has not been imported yet. */
  static hasLegacyData(): boolean {
    try {
      return localStorage.getItem(LEGACY_KEY) !== null;
    } catch {
      return false;
    }
  }

  // ── mutations ────────────────────────────────────────────────────────────

  private async writeLocal<T>(
    store: "profile" | "events" | "checkins" | "weights" | "hydration" | "friendships",
    row: T,
  ) {
    if (!this.db) return;
    await this.db.put(store as never, row as never);
  }

  async patchProfile(patch: Partial<ProfileRow>): Promise<void> {
    if (!this.db) return;
    // The first pull may not have landed yet — a user who opens Setup straight
    // away must not have their change silently dropped, so the patch is queued
    // against defaults and the pull merges around it.
    const base = this.snapshot.profile ?? defaultProfile(this.userId);
    const next: ProfileRow = {
      ...base,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    await this.writeLocal("profile", next);
    // Only the changed fields go on the wire, so two devices editing different
    // settings both win instead of the later whole-row write erasing the other.
    await enqueue(this.db, {
      table: "profiles",
      op: "upsert",
      key: this.userId,
      payload: patch as Record<string, unknown>,
      client_ts: next.updated_at,
    });
    this.emit({ profile: next, pending: await outboxDepth(this.db) });
    this.scheduleFlush();
  }

  async saveCheckin(values: {
    sleep: number;
    stress: number;
    energy: number;
    flushes?: number | null;
    mood?: number | null;
  }) {
    if (!this.db) return;
    const row: CheckinRow = {
      user_id: this.userId,
      date: today(),
      sleep: values.sleep,
      stress: values.stress,
      energy: values.energy,
      // Null means "not tracked" and is distinct from a zero flush count. Only
      // someone who declared a menopause stage is asked, so most rows stay
      // null forever and that has to stay distinguishable from "none today".
      // Written explicitly rather than by spread: `{ flushes: undefined }`
      // from a caller would otherwise overwrite the null and fail the insert.
      flushes: values.flushes ?? null,
      mood: values.mood ?? null,
    };
    await this.writeLocal("checkins", row);
    await enqueue(this.db, {
      table: "checkins",
      op: "upsert",
      key: row.date,
      payload: row as unknown as Record<string, unknown>,
      client_ts: nowTs(),
    });
    const checkins = [
      ...this.snapshot.checkins.filter((c) => c.date !== row.date),
      row,
    ].sort((a, b) => a.date.localeCompare(b.date));
    this.emit({ checkins, pending: await outboxDepth(this.db) });
    this.scheduleFlush();
  }

  async addWater(ml = 250) {
    if (!this.db) return;
    const date = today();
    const current = this.snapshot.hydration.find((h) => h.date === date);
    const row: HydrationRow = {
      user_id: this.userId,
      date,
      ml: Math.min(20000, (current?.ml ?? 0) + ml),
    };
    await this.writeLocal("hydration", row);
    await enqueue(this.db, {
      table: "hydration",
      op: "upsert",
      key: date,
      payload: row as unknown as Record<string, unknown>,
      client_ts: nowTs(),
    });
    const hydration = [
      ...this.snapshot.hydration.filter((h) => h.date !== date),
      row,
    ];
    this.emit({ hydration, pending: await outboxDepth(this.db) });
    this.scheduleFlush();
  }

  /**
   * Log today's measurements. Weight is required; everything else is optional
   * and null means "not measured today" rather than zero — a zero would draw a
   * cliff on the chart that never happened.
   *
   * Upserts on (user_id, date), so measuring grip in the morning and waist in
   * the evening merges into one row rather than losing the first.
   */
  async addWeight(
    kg: number,
    extra?: Partial<
      Pick<WeightRow, "waist_cm" | "grip_kg" | "sit_to_stand" | "balance_sec">
    >,
  ) {
    if (!this.db) return;
    if (!Number.isFinite(kg) || kg < 20 || kg > 300) return;
    const date = today();
    const prior = this.snapshot.weights.find((w) => w.date === date);
    const row: WeightRow = {
      user_id: this.userId,
      date,
      kg,
      source: "manual",
      waist_cm: extra?.waist_cm ?? prior?.waist_cm ?? null,
      grip_kg: extra?.grip_kg ?? prior?.grip_kg ?? null,
      sit_to_stand: extra?.sit_to_stand ?? prior?.sit_to_stand ?? null,
      balance_sec: extra?.balance_sec ?? prior?.balance_sec ?? null,
    };
    await this.writeLocal("weights", row);
    await enqueue(this.db, {
      table: "weights",
      op: "upsert",
      key: row.date,
      payload: row as unknown as Record<string, unknown>,
      client_ts: nowTs(),
    });
    const weights = [
      ...this.snapshot.weights.filter((w) => w.date !== row.date),
      row,
    ].sort((a, b) => a.date.localeCompare(b.date));
    this.emit({ weights, pending: await outboxDepth(this.db) });
    this.scheduleFlush();
  }

  async addEvent(input: {
    type: EventType;
    minutes: number;
    avg_hr?: number | null;
    distance_km?: number | null;
  }) {
    if (!this.db) return;
    if (!Number.isFinite(input.minutes) || input.minutes <= 0) return;
    const row: EventRow = {
      // Client-generated so a retried flush upserts the same row rather than
      // logging the session twice.
      id: uuid(),
      user_id: this.userId,
      date: today(),
      type: input.type,
      minutes: Math.min(1440, Math.round(input.minutes)),
      avg_hr: input.avg_hr ?? null,
      distance_km: input.distance_km ?? null,
      source: "manual",
      external_id: null,
      created_at: new Date().toISOString(),
    };
    await this.writeLocal("events", row);
    await enqueue(this.db, {
      table: "events",
      op: "upsert",
      key: row.id,
      payload: row as unknown as Record<string, unknown>,
      client_ts: nowTs(),
    });
    this.emit({
      events: [...this.snapshot.events, row].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      pending: await outboxDepth(this.db),
    });
    this.scheduleFlush();
  }

  /** "Mark session done" and "Count today's walk" both land here. */
  logSession(minutes: number) {
    return this.addEvent({ type: "Workout", minutes });
  }

  /**
   * Log a completed recovery session. Same path as a workout, deliberately:
   * Recovery having no "done ✓" while Train had one was the clearest signal in
   * the product that it was the optional half.
   */
  logRecovery(minutes: number) {
    return this.addEvent({ type: "Mobility", minutes });
  }

  async requestFriend(addressee: string) {
    if (!this.db) return;
    const row: FriendshipRow = {
      requester: this.userId,
      addressee,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    const key = friendshipKey(row);
    await this.writeLocal("friendships", { ...row, key });
    await enqueue(this.db, {
      table: "friendships",
      op: "upsert",
      key,
      payload: {
        requester: row.requester,
        addressee: row.addressee,
        status: "pending",
      },
      client_ts: nowTs(),
    });
    this.emit({
      friendships: [...this.snapshot.friendships, row],
      pending: await outboxDepth(this.db),
    });
    this.scheduleFlush();
  }

  async acceptFriend(requester: string) {
    if (!this.db) return;
    const key = friendshipKey({ requester, addressee: this.userId });
    const existing = this.snapshot.friendships.find(
      (f) => f.requester === requester && f.addressee === this.userId,
    );
    if (!existing) return;
    const row: FriendshipRow = { ...existing, status: "accepted" };
    await this.writeLocal("friendships", { ...row, key });
    await enqueue(this.db, {
      table: "friendships",
      op: "upsert",
      key,
      payload: { requester, addressee: this.userId, status: "accepted" },
      client_ts: nowTs(),
    });
    this.emit({
      friendships: this.snapshot.friendships.map((f) =>
        f.requester === requester && f.addressee === this.userId ? row : f,
      ),
      pending: await outboxDepth(this.db),
    });
    this.scheduleFlush();
  }

  async removeFriend(other: string) {
    if (!this.db) return;
    const existing = this.snapshot.friendships.find(
      (f) =>
        (f.requester === this.userId && f.addressee === other) ||
        (f.addressee === this.userId && f.requester === other),
    );
    if (!existing) return;
    const key = friendshipKey(existing);
    await this.db.delete("friendships", key);
    await enqueue(this.db, {
      table: "friendships",
      op: "delete",
      key,
      payload: {
        requester: existing.requester,
        addressee: existing.addressee,
      },
      client_ts: nowTs(),
    });
    this.emit({
      friendships: this.snapshot.friendships.filter((f) => f !== existing),
      pending: await outboxDepth(this.db),
    });
    this.scheduleFlush();
  }

  toggleMilestone(index: number) {
    return this.patchProfile({
      mobility: toggleMobility(this.snapshot.profile?.mobility, index),
    });
  }

  // ── local-only preferences ───────────────────────────────────────────────

  private async patchUi(patch: Partial<UiState>) {
    if (!this.db) return;
    const ui = { ...this.snapshot.ui, ...patch };
    await writeUi(this.db, ui);
    this.emit({ ui });
  }

  swapMeal(slot: string) {
    const mealIdx = {
      ...this.snapshot.ui.mealIdx,
      [slot]: (this.snapshot.ui.mealIdx[slot] ?? 0) + 1,
    };
    return this.patchUi({ mealIdx });
  }

  toggleDevice(id: string) {
    const devices = {
      ...this.snapshot.ui.devices,
      [id]: !this.snapshot.ui.devices[id],
    };
    return this.patchUi({ devices });
  }
}
