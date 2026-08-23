import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileRow } from "@/lib/types/database";
import type { GymDatabase, OutboxOp } from "@/lib/local/db";
import { coalesce, type CoalescedOp } from "./outbox";

type Client = SupabaseClient<Database>;

export interface PushResult {
  sent: number;
  /** Ops dropped because the server already holds a newer write. */
  superseded: number;
  failed: boolean;
  error?: string;
}

/**
 * Send one op and report whether the server accepted it.
 *
 * Conflict rules, per the handoff:
 *
 *  - **profiles** — last-write-wins by `updated_at`. The op carries only the
 *    fields the user actually changed and is guarded by
 *    `.lte("updated_at", client_ts)`, so a patch that left this device before
 *    another device's newer write simply matches no row and is dropped rather
 *    than clobbering it. Field-level patches also mean two devices editing
 *    *different* settings both win, which whole-row writes would not give us.
 *
 *  - **events / checkins / weights / hydration** — append-only keyed rows.
 *    Natural primary keys make an upsert idempotent, so a retry after a
 *    timeout can never double-log a session. Events carry a client-generated
 *    uuid for exactly this reason: the schema's `(user_id, source,
 *    external_id)` dedupe key cannot protect manual rows, whose external_id is
 *    null and therefore distinct from every other null.
 */
async function sendOne(
  supabase: Client,
  userId: string,
  op: OutboxOp,
): Promise<"ok" | "superseded"> {
  if (op.table === "profiles") {
    const { data, error } = await supabase
      .from("profiles")
      // The payload is a partial patch assembled at the enqueue site; its keys
      // are profile columns by construction, which the generic op shape cannot
      // express.
      .update(op.payload as Partial<ProfileRow>)
      .eq("id", userId)
      .lte("updated_at", op.client_ts)
      .select("id");
    if (error) throw error;
    return data && data.length > 0 ? "ok" : "superseded";
  }

  if (op.op === "delete") {
    if (op.table === "friendships") {
      const [requester, addressee] = op.key.split("|");
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("requester", requester)
        .eq("addressee", addressee);
      if (error) throw error;
      return "ok";
    }
    const { error } = await supabase
      .from(op.table)
      .delete()
      .match(op.payload as never);
    if (error) throw error;
    return "ok";
  }

  const { error } = await supabase
    .from(op.table)
    .upsert(op.payload as never);
  if (error) throw error;
  return "ok";
}

/**
 * Drain the outbox in order, stopping at the first failure so later writes
 * cannot overtake an earlier one that has not landed yet.
 */
export async function push(
  db: GymDatabase,
  supabase: Client,
  userId: string,
): Promise<PushResult> {
  const queued = await db.getAll("outbox");
  if (!queued.length) return { sent: 0, superseded: 0, failed: false };

  const batches: CoalescedOp[] = coalesce(queued);
  let sent = 0;
  let superseded = 0;

  for (const { op, seqs } of batches) {
    try {
      const outcome = await sendOne(supabase, userId, op);
      if (outcome === "superseded") superseded++;
      else sent++;
      const tx = db.transaction("outbox", "readwrite");
      await Promise.all(seqs.map((seq) => tx.store.delete(seq)));
      await tx.done;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Record the failure against the queued ops so a poison message is
      // visible rather than silently retried forever.
      const tx = db.transaction("outbox", "readwrite");
      for (const seq of seqs) {
        const row = await tx.store.get(seq);
        if (row) {
          await tx.store.put({
            ...row,
            attempts: row.attempts + 1,
            last_error: message,
          });
        }
      }
      await tx.done;
      return { sent, superseded, failed: true, error: message };
    }
  }

  return { sent, superseded, failed: false };
}
