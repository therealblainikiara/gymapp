"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, Kicker } from "@/components/ui";
import { useGym, useProfile, useStore } from "@/lib/local/provider";
import {
  BREATHING_MOVE,
  findRecoveryMove,
  resolveLymph,
} from "@/lib/domain/recovery";
import { buildRecovery } from "@/lib/domain/recovery-plan";
import { clock } from "@/lib/domain/dates";
import { exerciseSlug } from "@/lib/domain/exercises";

/** Box breathing: 4 s per phase, 16 s per cycle. */
const PHASES = ["INHALE", "HOLD", "EXHALE", "HOLD"];

/**
 * The detail route for a prescribed movement. The dose rides in the query
 * string because it belongs to the routine, not to the movement (C28) — the
 * same rock-back is eight reps here and a ninety-second hold there.
 */
function moveHref(m: { n: string; dose: string }) {
  return `/recover/${exerciseSlug(m.n)}?dose=${encodeURIComponent(m.dose)}`;
}

export default function RecoverScreen({
  startBreathing,
}: {
  startBreathing: boolean;
}) {
  const store = useStore();
  const profile = useProfile();
  const { status } = useGym();

  // Sessions are generated from the profile and placed on the days training
  // leaves free (C30); every movement in them passes the same filter the
  // workout plan does, replacing rather than dropping. Both hooks are keyed on
  // the fields that actually feed them, so an unrelated check-in does not
  // rebuild the week.
  const bone = profile.bone_health;
  const days = useMemo(
    () =>
      buildRecovery({
        bone_health: profile.bone_health,
        pelvic_floor: profile.pelvic_floor,
        session_len: profile.session_len,
        level: profile.level,
        avail_days: profile.avail_days,
      }),
    [
      profile.bone_health,
      profile.pelvic_floor,
      profile.session_len,
      profile.level,
      profile.avail_days,
    ],
  );
  const lymph = useMemo(() => resolveLymph({ bone_health: bone }), [bone]);
  const breathing = findRecoveryMove(BREATHING_MOVE);
  const swapped = useMemo(
    () =>
      [...days.flatMap((d) => d.moves), ...lymph].filter((m) => m.swappedFrom),
    [days, lymph],
  );

  // Home's "Breathing timer" tile deep-links straight into a running timer,
  // so the flag seeds the initial state rather than flipping it afterwards.
  const [running, setRunning] = useState(startBreathing);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running]);

  function toggleBreathing() {
    if (running) {
      setRunning(false);
      return;
    }
    setSeconds(0);
    setRunning(true);
  }

  const phase = running ? PHASES[Math.floor((seconds % 16) / 4)] : "READY";

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
        <Card
          className="elev-sm"
          style={{
            flex: "1 1 300px",
            padding: 18,
            gap: 10,
            alignItems: "center",
          }}
        >
          <Kicker style={{ alignSelf: "flex-start" }}>
            BOX BREATHING — 4·4·4·4
          </Kicker>
          <div
            style={{
              width: 130,
              height: 130,
              display: "grid",
              placeItems: "center",
              margin: "6px 0",
            }}
          >
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: "50%",
                background: "var(--color-accent-200)",
                border: "1px solid var(--color-accent)",
                display: "grid",
                placeItems: "center",
                animation: running
                  ? "breathe 16s ease-in-out infinite"
                  : "none",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 600,
                  fontSize: 15,
                  letterSpacing: "0.08em",
                  color: "var(--color-accent-800)",
                }}
              >
                {phase}
              </span>
            </div>
          </div>
          <span className="card-meta" aria-live="polite">
            {running ? `${clock(seconds)} — 4 s per phase` : "5 minutes is plenty"}
          </span>
          <button
            type="button"
            onClick={toggleBreathing}
            className="btn btn-primary"
            style={{ width: "100%" }}
          >
            {running ? "Stop" : "Start breathing"}
          </button>
          {breathing && (
            // The timer had no safety note at all before C28 put box breathing
            // in the library. The holds are the part that matters.
            <>
              <span className="card-meta" style={{ margin: 0 }}>
                {breathing.s}
              </span>
              <Link
                href={`/recover/${exerciseSlug(breathing.n)}`}
                className="card-meta gym-rowbtn"
                style={{ color: "var(--color-accent-700)" }}
              >
                Cues and variations →
              </Link>
            </>
          )}
        </Card>

        <Card style={{ flex: "1 1 300px", padding: 16, gap: 8 }}>
          <Kicker>LYMPHATIC DRAINAGE — 12 MIN</Kicker>
          {lymph.map((step, i) => (
            <Link
              key={step.n}
              href={moveHref(step)}
              className="gym-rowbtn"
              style={{
                display: "flex",
                gap: 8,
                fontSize: 13.5,
                padding: "3px 0",
                borderBottom:
                  "1px solid color-mix(in srgb, var(--color-text) 7%, transparent)",
              }}
            >
              <span
                style={{
                  color: "var(--color-accent)",
                  fontFamily: "var(--font-heading)",
                  flex: "none",
                }}
              >
                0{i + 1}
              </span>
              <span style={{ color: "var(--color-accent-700)" }}>
                {step.n} — {step.dose}
              </span>
            </Link>
          ))}
          <p className="card-meta" style={{ margin: "4px 0 0" }}>
            Light pressure only — lymph sits just under the skin. Stop anything
            that hurts.
          </p>
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(255px,1fr))",
          gap: 18,
        }}
      >
        {days.map((d) => (
          <Card
            key={d.label}
            style={{ padding: 16, gap: 8, animation: `fadeUp .4s ${d.delay} both` }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Kicker style={{ fontSize: 11 }}>{d.label}</Kicker>
              <span className="tag tag-neutral">≈ {d.minutes} MIN</span>
            </div>
            <span className="card-title" style={{ fontSize: 17 }}>
              {d.routine}
            </span>
            <span className="card-meta" style={{ margin: 0 }}>
              {d.focus}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {d.moves.map((m) => (
                <Link
                  key={m.n}
                  href={moveHref(m)}
                  className="gym-rowbtn"
                  title={m.c.join(" · ")}
                  style={{
                    fontSize: 12.5,
                    color: "var(--color-accent-700)",
                    padding: "1px 0",
                  }}
                >
                  — {m.n} {m.dose}
                  {m.swappedFrom && " ✎"}
                </Link>
              ))}
            </div>
            {d.reasons.map((r) => (
              <span key={r} className="card-meta" style={{ margin: 0 }}>
                {r}
              </span>
            ))}
            <p className="card-meta" style={{ margin: 0 }}>
              {d.tip}
            </p>
            <button
              type="button"
              onClick={() => void store.logRecovery(d.minutes)}
              disabled={status === "loading"}
              className="btn btn-secondary"
              style={{ fontSize: 12.5, padding: "5px 10px" }}
            >
              Mark session done ✓
            </button>
          </Card>
        ))}

        <Card style={{ padding: 16, gap: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Kicker>REST-DAY WALK</Kicker>
            <span className="tag tag-neutral">25 MIN</span>
          </div>
          <span className="card-title" style={{ fontSize: 17 }}>
            Brisk pace, head up
          </span>
          <p className="card-body" style={{ flex: "none" }}>
            Aim for a pace where talking is possible but singing isn&rsquo;t.
            Swing the arms — it doubles as lymph work.
          </p>
          <button
            type="button"
            onClick={() => void store.addEvent({ type: "Walk", minutes: 25 })}
            className="btn btn-secondary"
            style={{ fontSize: 12.5, padding: "5px 10px" }}
          >
            Count today&rsquo;s walk ✓
          </button>
          <span className="card-meta">
            Logs a 25-minute walk — counts toward your streak and the weekly
            challenge.
          </span>
        </Card>
      </div>

      {swapped.length > 0 && (
        <Card
          className="elev-sm"
          role="status"
          style={{ padding: 14, gap: 8, borderColor: "var(--color-accent)" }}
        >
          <Kicker style={{ alignSelf: "flex-start" }}>
            {swapped.length} MOVE{swapped.length === 1 ? "" : "S"} SWAPPED
          </Kicker>
          <span className="card-meta" style={{ margin: 0 }}>
            {swapped[0].reason}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {swapped.map((m) => (
              <span key={m.n} style={{ fontSize: 12.5, opacity: 0.85 }}>
                — <s style={{ opacity: 0.6 }}>{m.swappedFrom}</s> →{" "}
                <span style={{ color: "var(--color-accent-700)" }}>{m.n}</span>
              </span>
            ))}
          </div>
          <span className="card-meta">
            The swaps do the same job for the same length of time. Change your
            declarations in Setup if any of this is out of date.
          </span>
        </Card>
      )}

      <p className="card-meta" style={{ margin: 0 }}>
        {days.length} recovery day(s), placed on the days your{" "}
        {profile.avail_days.length} training day(s) leave free. Rest is part of
        the plan, not a gap in it. Minute totals are estimates from the doses.
      </p>
    </div>
  );
}
