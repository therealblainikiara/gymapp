import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  friendshipKey,
  type GymDatabase,
  type LocalSnapshot,
} from "@/lib/local/db";
import { pendingKeys } from "./outbox";

type Client = SupabaseClient<Database>;

/**
 * How far back to pull. The prototype kept the last 60 events and 30 weigh-ins;
 * the screens never look further back than the current week plus the sparkline
 * windows, so pulling a bounded window keeps the first sync fast on a phone.
 */
const EVENT_LIMIT = 400;

export interface PullResult {
  ok: boolean;
  error?: string;
}

/**
 * Fetch the server's copy and merge it into the cache.
 *
 * The merge rule is deliberately conservative: a row with an unflushed local
 * write wins, because that write has not reached the server yet and the
 * server's version is by definition older. Every other row takes the server's
 * value. Combined with the LWW guard in push.ts, the pair converges without
 * either side silently discarding a user's input.
 */
export async function pull(
  db: GymDatabase,
  supabase: Client,
  userId: string,
): Promise<PullResult> {
  try {
    const [profile, events, checkins, weights, hydration, friendships] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase
          .from("events")
          .select("*")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(EVENT_LIMIT),
        supabase.from("checkins").select("*").eq("user_id", userId),
        supabase.from("weights").select("*").eq("user_id", userId),
        supabase.from("hydration").select("*").eq("user_id", userId),
        supabase
          .from("friendships")
          .select("*")
          .or(`requester.eq.${userId},addressee.eq.${userId}`),
      ]);

    const firstError =
      profile.error ??
      events.error ??
      checkins.error ??
      weights.error ??
      hydration.error ??
      friendships.error;
    if (firstError) return { ok: false, error: firstError.message };

    const pending = await pendingKeys(db);
    const tx = db.transaction(
      ["profile", "events", "checkins", "weights", "hydration", "friendships"],
      "readwrite",
    );

    if (profile.data && !pending.has(`profiles|${userId}`)) {
      await tx.objectStore("profile").put(profile.data);
    }
    for (const row of events.data ?? []) {
      if (!pending.has(`events|${row.id}`)) {
        await tx.objectStore("events").put(row);
      }
    }
    for (const row of checkins.data ?? []) {
      if (!pending.has(`checkins|${row.date}`)) {
        await tx.objectStore("checkins").put(row);
      }
    }
    for (const row of weights.data ?? []) {
      if (!pending.has(`weights|${row.date}`)) {
        await tx.objectStore("weights").put(row);
      }
    }
    for (const row of hydration.data ?? []) {
      if (!pending.has(`hydration|${row.date}`)) {
        await tx.objectStore("hydration").put(row);
      }
    }
    for (const row of friendships.data ?? []) {
      const key = friendshipKey(row);
      if (!pending.has(`friendships|${key}`)) {
        await tx.objectStore("friendships").put({ ...row, key });
      }
    }
    await tx.done;

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Decide, for one row, whether the incoming server value should replace the
 * cached one. Extracted so the rule is testable without IndexedDB.
 */
export function serverWins(
  table: string,
  key: string,
  pending: Set<string>,
): boolean {
  return !pending.has(`${table}|${key}`);
}

export type { LocalSnapshot };
