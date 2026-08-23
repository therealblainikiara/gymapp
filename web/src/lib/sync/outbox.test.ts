import { describe, expect, it } from "vitest";
import { coalesce } from "./outbox";
import type { OutboxOp } from "@/lib/local/db";

function op(
  seq: number,
  table: OutboxOp["table"],
  key: string,
  payload: Record<string, unknown>,
  overrides: Partial<OutboxOp> = {},
): OutboxOp {
  return {
    seq,
    table,
    op: "upsert",
    key,
    payload,
    client_ts: `2026-08-23T10:00:${String(seq).padStart(2, "0")}.000Z`,
    attempts: 0,
    ...overrides,
  };
}

describe("outbox coalescing", () => {
  it("leaves unrelated rows alone", () => {
    const out = coalesce([
      op(1, "events", "a", { id: "a" }),
      op(2, "events", "b", { id: "b" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.op.key)).toEqual(["a", "b"]);
  });

  it("collapses repeated writes to one row into a single send", () => {
    // Eight taps of "+250 ml" offline must not become eight round-trips, and
    // must not replay stale totals over the newest one.
    const ops = Array.from({ length: 8 }, (_, i) =>
      op(i + 1, "hydration", "2026-08-23", {
        date: "2026-08-23",
        ml: (i + 1) * 250,
      }),
    );
    const out = coalesce(ops);
    expect(out).toHaveLength(1);
    expect(out[0].op.payload.ml).toBe(2000);
    expect(out[0].seqs).toHaveLength(8);
  });

  it("merges profile patches field by field, newest value winning", () => {
    const out = coalesce([
      op(1, "profiles", "u1", { goal: "muscle", level: "beginner" }),
      op(2, "profiles", "u1", { goal: "fat" }),
      op(3, "profiles", "u1", { session_len: 45 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].op.payload).toEqual({
      goal: "fat",
      level: "beginner",
      session_len: 45,
    });
  });

  it("carries the newest timestamp on a merged op", () => {
    const out = coalesce([
      op(1, "profiles", "u1", { goal: "muscle" }),
      op(2, "profiles", "u1", { goal: "fat" }),
    ]);
    expect(out[0].op.client_ts).toBe("2026-08-23T10:00:02.000Z");
  });

  it("keeps ordering between different rows by their last write", () => {
    const out = coalesce([
      op(1, "profiles", "u1", { goal: "muscle" }),
      op(2, "events", "e1", { id: "e1" }),
      op(3, "profiles", "u1", { goal: "fat" }),
    ]);
    // The profile's last write is seq 3, so it lands after the event.
    expect(out.map((c) => c.op.table)).toEqual(["events", "profiles"]);
  });

  it("lets a delete supersede everything queued before it for that row", () => {
    const out = coalesce([
      op(1, "friendships", "a|b", { requester: "a", addressee: "b" }),
      op(2, "friendships", "a|b", { status: "accepted" }),
      op(3, "friendships", "a|b", { requester: "a", addressee: "b" }, { op: "delete" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].op.op).toBe("delete");
    expect(out[0].seqs).toEqual([1, 2, 3]);
  });

  it("lets a re-create after a delete win", () => {
    const out = coalesce([
      op(1, "friendships", "a|b", { requester: "a", addressee: "b" }, { op: "delete" }),
      op(2, "friendships", "a|b", {
        requester: "a",
        addressee: "b",
        status: "pending",
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].op.op).toBe("upsert");
    expect(out[0].op.payload.status).toBe("pending");
  });

  it("does not mutate the ops it was given", () => {
    const first = op(1, "profiles", "u1", { goal: "muscle" });
    const second = op(2, "profiles", "u1", { goal: "fat" });
    coalesce([first, second]);
    expect(first.payload).toEqual({ goal: "muscle" });
    expect(second.payload).toEqual({ goal: "fat" });
  });

  it("returns nothing for an empty queue", () => {
    expect(coalesce([])).toEqual([]);
  });
});
