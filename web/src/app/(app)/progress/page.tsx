"use client";

import { useMemo, useState } from "react";
import { Card, Kicker, toggleStyle } from "@/components/ui";
import { useGym, useProfile, useStore } from "@/lib/local/provider";
import { activeDaySet, scaleSpark, streakFrom, weightSpark } from "@/lib/domain/progress";
import { bodyReadout } from "@/lib/domain/nutrition";
import { milestonesFor } from "@/lib/domain/recovery";
import { weekKeys } from "@/lib/domain/dates";
import {
  asFunctionValue,
  changeLine,
  functionSeries,
  type FunctionTestId,
} from "@/lib/domain/function-tests";

export default function ProgressScreen() {
  const store = useStore();
  const profile = useProfile();
  const { checkins, events, weights, ui } = useGym();

  const [kgInput, setKgInput] = useState("");
  const [waistInput, setWaistInput] = useState("");
  const [testInput, setTestInput] = useState<Record<string, string>>({});
  const [heightInput, setHeightInput] = useState(
    profile.height_cm ? String(profile.height_cm) : "",
  );
  const [ageInput, setAgeInput] = useState(
    profile.age ? String(profile.age) : "",
  );

  const streak = useMemo(
    () =>
      streakFrom(
        activeDaySet(
          checkins.map((c) => c.date),
          events.map((e) => e.date),
        ),
      ),
    [checkins, events],
  );

  const sessions = events.filter((e) => e.type === "Workout").length;

  const weekDone = useMemo(() => {
    const keys = new Set(weekKeys());
    const done = new Set<string>();
    for (const c of checkins) if (keys.has(c.date)) done.add(c.date);
    for (const e of events) if (keys.has(e.date)) done.add(e.date);
    return done.size;
  }, [checkins, events]);

  const last7 = checkins.slice(-7);
  const latestKg = weights.length ? weights[weights.length - 1].kg : null;
  const body = bodyReadout(profile.height_cm, latestKg);
  const recentWeights = weights.slice(-30);
  const latestWaist = [...weights].reverse().find((w) => w.waist_cm != null);
  const series = useMemo(() => functionSeries(weights), [weights]);

  /** Waist bounds match the CHECK, so a typo never reaches the outbox. */
  function asWaist(raw: string): number | null {
    const n = parseFloat(raw);
    return Number.isFinite(n) && n >= 40 && n <= 200 ? n : null;
  }

  function commitNumber(
    raw: string,
    field: "height_cm" | "age",
    lo: number,
    hi: number,
  ) {
    const trimmed = raw.trim();
    if (!trimmed) {
      void store.patchProfile({ [field]: null });
      return;
    }
    const n = Number(trimmed);
    // Out-of-range values would be rejected by the CHECK constraint and stall
    // the outbox, so they never get queued.
    if (!Number.isFinite(n) || n < lo || n > hi) return;
    void store.patchProfile({ [field]: field === "age" ? Math.round(n) : n });
  }

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
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
          gap: 14,
        }}
      >
        <StatTile value={streak} label="Day streak" />
        <StatTile value={sessions} label="Sessions logged" />
        <StatTile
          value={weekDone}
          label={`This week / ${Math.max(1, profile.avail_days.length)}`}
        />
        <StatTile value={checkins.length} label="Check-ins" />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "stretch",
        }}
      >
        <Card style={{ flex: "1 1 300px", padding: 16, gap: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Kicker>BODY WEIGHT — KG</Kicker>
            {ui.devices.scale && (
              <span className="tag tag-accent">SMART SCALE SYNC</span>
            )}
          </div>

          {recentWeights.length >= 2 ? (
            <>
              <svg
                viewBox="0 0 240 60"
                style={{ width: "100%" }}
                role="img"
                aria-label="Body weight trend"
              >
                <polyline
                  points={weightSpark(recentWeights.map((w) => w.kg))}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="1.5"
                />
              </svg>
              <span className="card-meta">
                Latest {latestKg} kg · {recentWeights.length} entries
                {latestWaist && ` · waist ${latestWaist.waist_cm} cm`}
              </span>
            </>
          ) : (
            <p className="card-meta" style={{ margin: 0 }}>
              No entries yet — log your first weigh-in below.
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 4,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              className="input"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 82.4"
              aria-label="Body weight in kilograms"
              value={kgInput}
              onChange={(e) => setKgInput(e.target.value)}
              style={{ maxWidth: 130 }}
            />
            <button
              type="button"
              onClick={() => {
                const kg = parseFloat(kgInput);
                if (!Number.isFinite(kg)) return;
                void store.addWeight(kg, {
                  waist_cm: asWaist(waistInput),
                });
                setKgInput("");
                setWaistInput("");
              }}
              className="btn btn-primary"
            >
              Log kg
            </button>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              placeholder="Waist cm"
              aria-label="Waist circumference in centimetres"
              value={waistInput}
              onChange={(e) => setWaistInput(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="Height cm"
              aria-label="Height in centimetres"
              value={heightInput}
              onChange={(e) => setHeightInput(e.target.value)}
              onBlur={() => commitNumber(heightInput, "height_cm", 100, 250)}
              style={{ maxWidth: 110 }}
            />
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="Age"
              aria-label="Age in years"
              value={ageInput}
              onChange={(e) => setAgeInput(e.target.value)}
              onBlur={() => commitNumber(ageInput, "age", 13, 120)}
              style={{ maxWidth: 80 }}
            />
            <div className="seg">
              {(
                [
                  { id: "m", label: "Male" },
                  { id: "f", label: "Female" },
                ] as const
              ).map((o) => (
                <label key={o.id} className="seg-opt">
                  <input
                    type="radio"
                    name="sex"
                    value={o.id}
                    checked={(profile.sex ?? "m") === o.id}
                    onChange={() => void store.patchProfile({ sex: o.id })}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--color-divider)",
              paddingTop: 8,
              marginTop: 6,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {body.hasBmi && <span style={{ fontSize: 13 }}>{body.bmiLine}</span>}
            <span className="card-meta">{body.rangeLine}</span>
          </div>
        </Card>

        <Card style={{ flex: "1 1 300px", padding: 16, gap: 8 }}>
          <Kicker>SLEEP · STRESS · ENERGY (1–5)</Kicker>
          {last7.length >= 2 ? (
            <>
              <svg
                viewBox="0 0 240 60"
                style={{ width: "100%" }}
                role="img"
                aria-label="Energy and stress over the last seven check-ins"
              >
                <polyline
                  points={scaleSpark(last7.map((c) => c.energy), 240, 60)}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="1.5"
                />
                <polyline
                  points={scaleSpark(last7.map((c) => c.stress), 240, 60)}
                  fill="none"
                  stroke="var(--color-neutral-500)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              </svg>
              <div style={{ display: "flex", gap: 14 }} className="card-meta">
                <span style={{ color: "var(--color-accent-700)" }}>— Energy</span>
                <span>--- Stress</span>
              </div>
            </>
          ) : (
            <p className="card-meta" style={{ margin: 0 }}>
              Check in daily on Home to build this chart.
            </p>
          )}
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
          gap: 18,
        }}
      >
        {series.map((s) => (
          <Card key={s.test.id} style={{ padding: 16, gap: 8 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Kicker>{s.test.label.toUpperCase()}</Kicker>
              <span className="tag tag-neutral">{s.test.unit}</span>
            </div>
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
                fontSize: 30,
                lineHeight: 1,
              }}
            >
              {s.latest ?? "—"}
            </span>
            <span className="card-meta" style={{ margin: 0 }}>
              {changeLine(s)}
            </span>
            {s.points.length >= 2 && (
              <svg
                viewBox="0 0 240 60"
                style={{ width: "100%" }}
                role="img"
                aria-label={`${s.test.label} trend`}
              >
                <polyline
                  points={weightSpark(s.points.map((p) => p.value))}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="1.5"
                />
              </svg>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {s.test.protocol.map((line) => (
                <span key={line} style={{ fontSize: 12, opacity: 0.75 }}>
                  — {line}
                </span>
              ))}
            </div>
            <p className="card-meta" style={{ margin: 0 }}>
              {s.test.why}
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                step={s.test.step}
                placeholder={s.test.unit}
                aria-label={`${s.test.label} in ${s.test.unit}`}
                value={testInput[s.test.id] ?? ""}
                onChange={(e) =>
                  setTestInput((t) => ({ ...t, [s.test.id]: e.target.value }))
                }
                style={{ maxWidth: 100 }}
              />
              <button
                type="button"
                onClick={() => {
                  const v = asFunctionValue(
                    s.test.id as FunctionTestId,
                    testInput[s.test.id],
                  );
                  // Needs a weight for the day, since these ride on the same
                  // row. Logging a grip reading is not a reason to invent a
                  // weight, so the button asks for one rather than guessing.
                  if (v === null || latestKg === null) return;
                  void store.addWeight(latestKg, { [s.test.id]: v });
                  setTestInput((t) => ({ ...t, [s.test.id]: "" }));
                }}
                disabled={latestKg === null}
                className="btn btn-secondary"
                style={{ fontSize: 12.5, padding: "5px 10px" }}
              >
                Log
              </button>
            </div>
            {latestKg === null && (
              <span className="card-meta" style={{ margin: 0 }}>
                Log a weight first — these are stored with it.
              </span>
            )}
          </Card>
        ))}
      </div>

      <p className="card-meta" style={{ margin: 0 }}>
        These three predict falls, fractures and independence better than body
        weight does, and they answer to training. There are no age or sex bands
        here on purpose: your own trend is the comparison that matters, and the
        only one we can stand behind.
      </p>

      <Card style={{ padding: 16, gap: 8 }}>
        <Kicker>MOBILITY MILESTONES</Kicker>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))",
            gap: 8,
          }}
        >
          {milestonesFor(profile).map((t, i) => {
            const done = profile.mobility[i] === true;
            return (
              <button
                key={t.n}
                type="button"
                title={
                  t.swappedFrom
                    ? `Swapped from "${t.swappedFrom}" — that version bends the spine forward, which your declared bone health rules out.`
                    : undefined
                }
                aria-pressed={done}
                onClick={() => void store.toggleMilestone(i)}
                className="btn"
                style={{
                  justifyContent: "flex-start",
                  gap: 8,
                  fontFamily: "var(--font-body)",
                  fontWeight: 400,
                  fontSize: 13,
                  textAlign: "left",
                  ...(done
                    ? {
                        background: "var(--color-accent-100)",
                        color: "var(--color-accent-800)",
                        borderColor: "var(--color-accent)",
                      }
                    : toggleStyle(false)),
                }}
              >
                {done ? "☑" : "☐"} {t.n}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <Card style={{ padding: 14, gap: 2 }}>
      <span
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 600,
          fontSize: 36,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        className="card-meta"
        style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
      >
        {label}
      </span>
    </Card>
  );
}
