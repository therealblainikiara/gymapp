"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Kicker } from "@/components/ui";
import { useProfile, useStore } from "@/lib/local/provider";
import { LYMPH, STRETCHES } from "@/lib/domain/recovery";
import { clock } from "@/lib/domain/dates";

/** Box breathing: 4 s per phase, 16 s per cycle. */
const PHASES = ["INHALE", "HOLD", "EXHALE", "HOLD"];

export default function RecoverScreen({
  startBreathing,
}: {
  startBreathing: boolean;
}) {
  const store = useStore();
  const profile = useProfile();

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
        </Card>

        <Card style={{ flex: "1 1 300px", padding: 16, gap: 8 }}>
          <Kicker>LYMPHATIC DRAINAGE — 12 MIN</Kicker>
          {LYMPH.map((step, i) => (
            <div
              key={step}
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
              <span>{step}</span>
            </div>
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
        {STRETCHES.map((r) => (
          <Card key={r.n} style={{ padding: 16, gap: 8 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Kicker>STRETCH ROUTINE</Kicker>
              <span className="tag tag-neutral">{r.min} MIN</span>
            </div>
            <span className="card-title" style={{ fontSize: 17 }}>
              {r.n}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {r.steps.map((s) => (
                <span key={s} style={{ fontSize: 12.5, opacity: 0.8 }}>
                  — {s}
                </span>
              ))}
            </div>
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

      <p className="card-meta" style={{ margin: 0 }}>
        Recovery days are scheduled around your {profile.avail_days.length}{" "}
        training day(s). Rest is part of the plan, not a gap in it.
      </p>
    </div>
  );
}
