import type { GymDatabase, OutboxOp, SyncTable } from "@/lib/local/db";

/**
 * The outbox queue. Every mutation appends `{table, op, payload, client_ts}`
 * here in the same transaction that updates the cache, and a worker drains it
 * whenever the network is up. Nothing in the UI ever waits on the network.
 */

export interface CoalescedOp {
  op: OutboxOp;
  /** Every queued seq this one op replaces, so the flush can clear them all. */
  seqs: number[];
}

/**
 * Collapse repeated writes to the same row into one.
 *
 * This is not just an optimisation. Tapping "+250 ml" eight times offline
 * queues eight ops carrying absolute totals; replaying all eight is wasted
 * round-trips, and replaying them out of order would be wrong. Merging by row
 * leaves exactly one write per row, carrying the newest value of every field.
 *
 * Ordering between different rows follows each group's last write, so a
 * profile edit made after logging a session still lands after it.
 */
export function coalesce(ops: OutboxOp[]): CoalescedOp[] {
  const groups = new Map<string, CoalescedOp>();

  for (const op of ops) {
    const id = `${op.table}|${op.key}`;
    const existing = groups.get(id);
    if (!existing) {
      groups.set(id, { op: { ...op, payload: { ...op.payload } }, seqs: [op.seq!] });
      continue;
    }
    existing.seqs.push(op.seq!);
    if (op.op === "delete") {
      // A delete supersedes everything queued before it for this row.
      existing.op = { ...op, payload: { ...op.payload } };
    } else if (existing.op.op === "delete") {
      // Re-created after a delete: the upsert is the whole truth.
      existing.op = { ...op, payload: { ...op.payload } };
    } else {
      existing.op = {
        ...existing.op,
        payload: { ...existing.op.payload, ...op.payload },
        client_ts:
          op.client_ts > existing.op.client_ts
            ? op.client_ts
            : existing.op.client_ts,
      };
    }
  }

  return [...groups.values()].sort(
    (a, b) => Math.max(...a.seqs) - Math.max(...b.seqs),
  );
}

export async function enqueue(
  db: GymDatabase,
  op: Omit<OutboxOp, "seq" | "attempts">,
): Promise<void> {
  await db.add("outbox", { ...op, attempts: 0 });
}

export async function pendingKeys(
  db: GymDatabase,
): Promise<Set<string>> {
  const ops = await db.getAll("outbox");
  return new Set(ops.map((o) => `${o.table}|${o.key}`));
}

export async function outboxDepth(db: GymDatabase): Promise<number> {
  return db.count("outbox");
}

export function nowTs(): string {
  return new Date().toISOString();
}

/**
 * Row identity, shared by the enqueue sites and the merge in pull.ts so both
 * agree on what "the same row" means.
 */
export const rowKey: Record<SyncTable, (...parts: string[]) => string> = {
  profiles: (id) => id,
  events: (id) => id,
  checkins: (date) => date,
  weights: (date) => date,
  hydration: (date) => date,
  friendships: (requester, addressee) => `${requester}|${addressee}`,
};
