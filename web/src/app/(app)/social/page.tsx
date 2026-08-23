"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Kicker, toggleStyle } from "@/components/ui";
import { useGym, useProfile, useStore } from "@/lib/local/provider";
import { browserClient } from "@/lib/supabase/client";
import { dateKey, weekKeys, weekStart } from "@/lib/domain/dates";
import type {
  EventType,
  LeaderboardRow,
  SearchProfileResult,
} from "@/lib/types/database";

/**
 * Social — the weekly challenge, activity logging, the leaderboard and partner
 * search.
 *
 * The leaderboard is the one screen that cannot be served from the local
 * cache: other people's minutes are not this device's data. It comes from
 * `friend_leaderboard()`, which sums `events` server-side — the client never
 * reports a total, so a modified client cannot win a challenge by claiming
 * one. Your own row still comes from the cache while offline, so the screen
 * degrades to "you, so far" rather than to nothing.
 *
 * The weekly cron that seeds each Sunday's `challenges` row is C11 and lands
 * in M3; until then the client falls back to the current week's Sunday, which
 * produces the same target.
 */

const ACTIVITY_TYPES: EventType[] = [
  "Walk",
  "Ride",
  "Run",
  "Swim",
  "Squash",
  "Tennis",
  "Other sport",
];

const DEFAULT_TARGET = 150;

export default function SocialScreen() {
  const store = useStore();
  const profile = useProfile();
  const { events, friendships, userId, status } = useGym();

  const [type, setType] = useState<EventType>("Walk");
  const [minutes, setMinutes] = useState("");
  const [hr, setHr] = useState("");
  const [dist, setDist] = useState("");

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{
    q: string;
    results: SearchProfileResult[];
    error: string | null;
  }>({ q: "", results: [], error: null });

  const [board, setBoard] = useState<LeaderboardRow[] | null>(null);
  const [target, setTarget] = useState(DEFAULT_TARGET);

  const sundayKey = dateKey(weekStart());

  const localMinutes = useMemo(() => {
    const keys = new Set(weekKeys());
    return events
      .filter((e) => keys.has(e.date))
      .reduce((sum, e) => sum + e.minutes, 0);
  }, [events]);

  // Refetched whenever the week rolls over or this device logs something, so
  // your own row moves immediately and friends' rows follow on the next pass.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = browserClient();
      const [challenge, rows] = await Promise.all([
        supabase
          .from("challenges")
          .select("target")
          .eq("week_start", sundayKey)
          .eq("metric", "active_minutes")
          .maybeSingle(),
        supabase.rpc("friend_leaderboard", { week_start: sundayKey }),
      ]);
      if (cancelled) return;
      // No row yet means the weekly seeding job (C11, M3) has not run; the
      // default target is the same 150 minutes the challenge has always been.
      if (challenge.data?.target) setTarget(challenge.data.target);
      if (!rows.error && rows.data) setBoard(rows.data as LeaderboardRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [sundayKey, events.length]);

  // Debounced so a search does not fire per keystroke. The effect only writes
  // state from the async callback; whether we are mid-search is derived below
  // by comparing the query to the one the last result was for.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      const { data, error } = await browserClient().rpc("search_profiles", {
        q,
      });
      if (cancelled) return;
      setSearch(
        error
          ? { q, results: [], error: error.message }
          : { q, results: (data ?? []) as SearchProfileResult[], error: null },
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const trimmedQuery = query.trim();
  const queryTooShort = trimmedQuery.length < 2;
  const resultsAreFresh = search.q === trimmedQuery;
  const searching = !queryTooShort && !resultsAreFresh;
  const results = queryTooShort || !resultsAreFresh ? null : search.results;
  const searchError = resultsAreFresh ? search.error : null;

  const friendState = (id: string) => {
    const f = friendships.find(
      (x) =>
        (x.requester === userId && x.addressee === id) ||
        (x.addressee === userId && x.requester === id),
    );
    if (!f) return "none" as const;
    if (f.status === "accepted") return "friends" as const;
    return f.requester === userId ? ("sent" as const) : ("incoming" as const);
  };

  // Offline, or before the first RPC lands, show what this device knows.
  const rows: LeaderboardRow[] =
    board ??
    [
      {
        user_id: userId,
        display_name: profile.display_name ?? "You",
        handle: profile.handle,
        minutes: localMinutes,
      },
    ];
  const sorted = [...rows].sort((a, b) => b.minutes - a.minutes);
  const mine = sorted.find((r) => r.user_id === userId)?.minutes ?? localMinutes;
  const activeMin = Math.max(mine, localMinutes);

  const incoming = friendships.filter(
    (f) => f.addressee === userId && f.status === "pending",
  );

  const daysLeft = 7 - new Date().getDay();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        animation: "fadeUp .3s both",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        <Card className="elev-sm" style={{ flex: "2 1 320px", padding: 16, gap: 10 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Kicker>WEEKLY CHALLENGE</Kicker>
            <span className="tag tag-accent">
              {daysLeft} {daysLeft === 1 ? "DAY LEFT" : "DAYS LEFT"}
            </span>
          </div>
          <span className="card-title" style={{ fontSize: 22 }}>
            {target} active minutes this week
          </span>
          <p className="card-body" style={{ flex: "none", margin: 0 }}>
            Workouts, walks, rides and sports all count. Resets Sunday.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                flex: 1,
                height: 8,
                border: "1px solid var(--color-divider)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "var(--color-accent)",
                  width: `${Math.min(100, (activeMin / target) * 100).toFixed(0)}%`,
                  transition: "width .3s",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
                fontSize: 20,
                whiteSpace: "nowrap",
              }}
            >
              {activeMin} / {target}
            </span>
          </div>
          {activeMin >= target && (
            <span className="tag tag-accent" style={{ alignSelf: "flex-start" }}>
              CHALLENGE COMPLETE ✓
            </span>
          )}
        </Card>

        <Card style={{ flex: "1 1 240px", padding: 16, gap: 8 }}>
          <Kicker>LOG AN ACTIVITY</Kicker>
          <select
            className="input"
            aria-label="Activity type"
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="Minutes"
              aria-label="Minutes"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="Avg HR"
              aria-label="Average heart rate"
              value={hr}
              onChange={(e) => setHr(e.target.value)}
            />
          </div>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder="Distance km (optional)"
            aria-label="Distance in kilometres"
            value={dist}
            onChange={(e) => setDist(e.target.value)}
          />
          <button
            type="button"
            disabled={status === "loading"}
            onClick={() => {
              const m = parseInt(minutes, 10);
              if (!Number.isFinite(m) || m <= 0) return;
              const hrValue = parseInt(hr, 10);
              const distValue = parseFloat(dist);
              void store.addEvent({
                type,
                minutes: m,
                avg_hr:
                  Number.isFinite(hrValue) && hrValue >= 20 && hrValue <= 250
                    ? hrValue
                    : null,
                distance_km:
                  Number.isFinite(distValue) && distValue >= 0
                    ? distValue
                    : null,
              });
              setMinutes("");
              setHr("");
              setDist("");
            }}
            className="btn btn-primary"
          >
            Log activity ✓
          </button>
          <span className="card-meta">
            Counts toward the challenge and your streak. Auto-import arrives
            with the phone link.
          </span>
        </Card>
      </div>

      {incoming.length > 0 && (
        <Card style={{ padding: 16, gap: 8 }}>
          <Kicker>FRIEND REQUESTS</Kicker>
          {incoming.map((f) => (
            <div
              key={f.requester}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 2px",
              }}
            >
              <span style={{ flex: 1, fontSize: 13.5 }}>
                Someone wants to train with you
              </span>
              <button
                type="button"
                onClick={() => void store.acceptFriend(f.requester)}
                className="btn btn-primary"
                style={{ fontSize: 12, padding: "3px 10px" }}
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => void store.removeFriend(f.requester)}
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "3px 10px" }}
              >
                Decline
              </button>
            </div>
          ))}
        </Card>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <Card style={{ flex: "1 1 300px", padding: 16, gap: 8 }}>
          <Kicker>LEADERBOARD — ACTIVE MINUTES</Kicker>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sorted.map((u, i) => (
              <div
                key={u.user_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 4px",
                  borderBottom:
                    "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                  background:
                    u.user_id === userId
                      ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                      : "transparent",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 600,
                    width: 22,
                    color: "var(--color-accent)",
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    flex: "none",
                    display: "grid",
                    placeItems: "center",
                    border: "1px solid var(--color-divider)",
                    fontFamily: "var(--font-heading)",
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {u.user_id === userId ? "YOU" : initials(u)}
                </span>
                <span style={{ flex: 1, fontSize: 13.5 }}>
                  {u.user_id === userId ? "You" : displayName(u)}
                </span>
                <span
                  style={{ fontFamily: "var(--font-heading)", fontWeight: 600 }}
                >
                  {u.minutes} min
                </span>
              </div>
            ))}
          </div>
          {sorted.length <= 1 && (
            <span className="card-meta">
              Add training partners to build the board.
            </span>
          )}
        </Card>

        <Card style={{ flex: "1 1 300px", padding: 16, gap: 8 }}>
          <Kicker>FIND TRAINING PARTNERS</Kicker>
          <input
            className="input"
            placeholder="Search by name or handle…"
            aria-label="Search for training partners"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {results?.map((u) => {
              const state = friendState(u.id);
              return (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 2px",
                    borderBottom:
                      "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      flex: "none",
                      display: "grid",
                      placeItems: "center",
                      border: "1px solid var(--color-divider)",
                      fontFamily: "var(--font-heading)",
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    {initials(u)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5 }}>{displayName(u)}</div>
                    <div className="card-meta">@{u.handle}</div>
                  </div>
                  <button
                    type="button"
                    disabled={state !== "none"}
                    onClick={() => void store.requestFriend(u.id)}
                    className="btn"
                    style={{
                      fontSize: 12,
                      padding: "3px 10px",
                      ...toggleStyle(state === "friends"),
                    }}
                  >
                    {state === "friends"
                      ? "Training partner"
                      : state === "sent"
                        ? "Requested"
                        : state === "incoming"
                          ? "Wants to join"
                          : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
          {searching && <span className="card-meta">Searching…</span>}
          {results?.length === 0 && !searching && !searchError && (
            <span className="card-meta">
              No one found. People are only discoverable once they have set a
              handle in Settings.
            </span>
          )}
          {searchError && (
            <span className="card-meta" role="alert">
              Search unavailable right now — {searchError}
            </span>
          )}
          <span className="card-meta">
            Search returns names and handles only. Your weight, age, injuries
            and dietary requirements are never visible to other users.
          </span>
        </Card>
      </div>

      {events.length > 0 && (
        <Card style={{ padding: 16, gap: 8 }}>
          <Kicker>RECENT ACTIVITIES</Kicker>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[...events]
              .slice(-8)
              .reverse()
              .map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 2px",
                    borderBottom:
                      "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    className="tag tag-neutral"
                    style={{ width: 74, justifyContent: "center" }}
                  >
                    {ev.type.toUpperCase()}
                  </span>
                  <span className="text-muted" style={{ fontSize: 13 }}>
                    {ev.date}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontSize: 13.5,
                      fontFamily: "var(--font-heading)",
                      fontWeight: 600,
                    }}
                  >
                    {[
                      `${ev.minutes} min`,
                      ev.avg_hr ? `${ev.avg_hr} bpm` : null,
                      ev.distance_km ? `${ev.distance_km} km` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function displayName(u: { display_name: string | null; handle: string | null }) {
  return u.display_name ?? (u.handle ? `@${u.handle}` : "Gym App user");
}

function initials(u: { display_name: string | null; handle: string | null }) {
  const source = u.display_name ?? u.handle ?? "?";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
