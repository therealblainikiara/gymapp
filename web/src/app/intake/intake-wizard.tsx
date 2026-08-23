"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { Card, Kicker } from "@/components/ui";
import {
  DayPicker,
  DeviceList,
  DietaryPicker,
  GoalPicker,
  InjuryPicker,
  KIT_OPTIONS,
  LEN_OPTIONS,
  LEVEL_OPTIONS,
  MusclePicker,
  Segmented,
  TIME_OPTIONS,
} from "@/components/settings-controls";
import { GOALS } from "@/lib/domain/goals";
import { DAY_NAMES } from "@/lib/domain/dates";
import { injuryLabel } from "@/lib/domain/exercises";
import { dietaryLabel } from "@/lib/domain/meals";
import { openLocalDb, readUi, writeUi } from "@/lib/local/db";
import type {
  DietaryKey,
  Goal,
  InjuryKey,
  Kit,
  Level,
  MuscleKey,
  PrefTime,
  ProfileRow,
  SessionLen,
} from "@/lib/types/database";

/**
 * The 7-step intake questionnaire, ported from the prototype's wizard.
 *
 * The user's brief for this screen was specific: work out "the time they have
 * and preferable exercise times", "any areas of injury or specific things the
 * user wants to work on", and dietary requirements treated as health
 * requirements. The step order and the copy are the approved ones.
 *
 * Answers are held locally and written once, at "Build my plan", together with
 * `intake_completed_at` — so a half-finished wizard never produces a
 * half-configured plan, and abandoning it leaves the gate closed.
 */

const STEP_NAMES = [
  "Schedule",
  "Time",
  "Goal",
  "Focus & injuries",
  "Dietary",
  "Equipment",
  "Devices",
];

const PAIRING_MS = 1400;

interface Draft {
  goal: Goal;
  muscles: MuscleKey[];
  level: Level;
  kit: Kit;
  session_len: SessionLen;
  avail_days: number[];
  pref_time: PrefTime;
  dietary: DietaryKey[];
  injuries: InjuryKey[];
}

export default function IntakeWizard({
  userId,
  initial,
}: {
  userId: string;
  initial: ProfileRow | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>({
    goal: initial?.goal ?? "general",
    muscles: initial?.muscles ?? [],
    level: initial?.level ?? "intermediate",
    kit: initial?.kit ?? "dbbw",
    session_len: initial?.session_len ?? 30,
    avail_days: initial?.avail_days ?? [1, 3, 5],
    pref_time: initial?.pref_time ?? "morning",
    dietary: initial?.dietary ?? [],
    injuries: initial?.injuries ?? [],
  });

  const [devices, setDevices] = useState<Record<string, boolean>>({});
  const [pairing, setPairing] = useState<string | null>(null);
  const pairTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Device flags are local-only, so they come from and go back to the cache
  // rather than the profile table.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await openLocalDb(userId);
      const ui = await readUi(db);
      if (!cancelled) setDevices(ui.devices);
      db.close();
    })();
    return () => {
      cancelled = true;
      if (pairTimer.current) clearTimeout(pairTimer.current);
    };
  }, [userId]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleDevice(id: string) {
    if (devices[id]) {
      setDevices((d) => ({ ...d, [id]: false }));
      return;
    }
    if (pairing) return;
    setPairing(id);
    pairTimer.current = setTimeout(() => {
      setDevices((d) => ({ ...d, [id]: true }));
      setPairing(null);
    }, PAIRING_MS);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const supabase = browserClient();
    const { error } = await supabase
      .from("profiles")
      .update({ ...draft, intake_completed_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const db = await openLocalDb(userId);
    const ui = await readUi(db);
    await writeUi(db, { ...ui, devices });
    db.close();

    router.replace("/home");
    router.refresh();
  }

  const canAdvance = !(step === 0 && draft.avail_days.length === 0);
  const goalSpec = GOALS[draft.goal];

  const summary = [
    goalSpec.label,
    `${Math.max(1, draft.avail_days.length)} day(s)/week (${draft.avail_days
      .map((i) => DAY_NAMES[i])
      .join(", ")})`,
    `${draft.session_len} min, ${TIME_OPTIONS.find((o) => o.id === draft.pref_time)?.label}`,
    draft.kit === "dbbw" ? "bodyweight + dumbbells" : "bodyweight only",
  ].join(" · ");
  const summaryExtras = [
    draft.injuries.length
      ? `working around: ${draft.injuries.map(injuryLabel).join(", ").toLowerCase()}`
      : null,
    draft.dietary.length
      ? `dietary: ${draft.dietary.map(dietaryLabel).join(", ").toLowerCase()}`
      : null,
  ].filter(Boolean);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <Card
        className="elev-md"
        style={{
          width: "100%",
          maxWidth: 620,
          padding: 26,
          gap: 16,
          animation: "fadeUp .35s both",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <Kicker style={{ fontSize: 11 }}>
            BUILDING YOUR PLAN — STEP {step + 1} OF 7 —{" "}
            {STEP_NAMES[step].toUpperCase()}
          </Kicker>
          <span className="card-meta">GYM APP INTAKE</span>
        </div>
        <div style={{ height: 3, border: "1px solid var(--color-divider)" }}>
          <div
            style={{
              height: "100%",
              background: "var(--color-accent)",
              width: `${(((step + 1) / 7) * 100).toFixed(0)}%`,
              transition: "width .3s",
            }}
          />
        </div>

        {step === 0 && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>
              Your week, honestly
            </h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              Around work and other commitments — which days can you
              realistically train? Pick the days that usually stay free. Your
              plan schedules sessions only on these days; the rest become
              recovery days.
            </p>
            <DayPicker
              value={draft.avail_days}
              onChange={(v) => set("avail_days", v)}
            />
            <span className="card-meta">
              {draft.avail_days.length
                ? `${draft.avail_days.length} training day(s) / week — the rest are scheduled recovery.`
                : "Pick at least one day to continue."}
            </span>
          </>
        )}

        {step === 1 && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>
              When, and for how long
            </h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              When do you prefer to exercise, and how much time will you
              honestly give per day? Short and consistent beats long and
              abandoned.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h6 style={{ margin: 0 }}>Preferred time</h6>
              <Segmented
                name="ptime"
                options={TIME_OPTIONS}
                value={draft.pref_time}
                onChange={(v) => set("pref_time", v)}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h6 style={{ margin: 0 }}>Time per day</h6>
              <Segmented
                name="len"
                options={LEN_OPTIONS}
                value={draft.session_len}
                onChange={(v) => set("session_len", v)}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>Your goal</h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              One primary goal. Everything — sets, reps, rests, calories — is
              drafted from this.
            </p>
            <GoalPicker value={draft.goal} onChange={(v) => set("goal", v)} />
          </>
        )}

        {step === 3 && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>
              Focus &amp; injuries
            </h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              What do you want to work on — and just as important, what should
              the plan work <em>around</em>? Exercises that load an injured area
              are removed automatically.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h6 style={{ margin: 0 }}>
                Areas to work on{" "}
                <span
                  className="text-muted"
                  style={{
                    fontWeight: 400,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  — none = full body
                </span>
              </h6>
              <MusclePicker
                value={draft.muscles}
                onChange={(v) => set("muscles", v)}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h6 style={{ margin: 0 }}>Current injuries or sensitive areas</h6>
              <InjuryPicker
                value={draft.injuries}
                onChange={(v) => set("injuries", v)}
              />
              <span className="card-meta">
                A flagged area filters out exercises that load it. Still consult
                a professional about any injury.
              </span>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>
              Dietary requirements
            </h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              These are treated as{" "}
              <strong>health requirements, not preferences</strong> — meals that
              don&rsquo;t comply are removed entirely, never just
              deprioritised. Always verify labels yourself.
            </p>
            <DietaryPicker
              large
              value={draft.dietary}
              onChange={(v) => set("dietary", v)}
            />
            <span className="card-meta">
              {draft.dietary.length
                ? `Active: ${draft.dietary.map(dietaryLabel).join(", ")}.`
                : "None selected — all meals available."}
            </span>
          </>
        )}

        {step === 5 && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>
              Equipment &amp; experience
            </h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              What&rsquo;s actually available to you, and where are you starting
              from?
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <h6 style={{ margin: 0 }}>Equipment</h6>
                <Segmented
                  name="kit"
                  options={KIT_OPTIONS}
                  value={draft.kit}
                  onChange={(v) => set("kit", v)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <h6 style={{ margin: 0 }}>Level</h6>
                <Segmented
                  name="level"
                  options={LEVEL_OPTIONS}
                  value={draft.level}
                  onChange={(v) => set("level", v)}
                />
              </div>
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>
              Connect your devices
            </h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              Link a watch, phone or smart scale to sync steps, heart rate,
              sleep and weight. Optional — you can do this later in Settings.
            </p>
            <DeviceList
              linked={devices}
              pairing={pairing}
              onToggle={toggleDevice}
            />
            <div
              style={{
                border: "1px solid var(--color-divider)",
                padding: 12,
                fontSize: 13,
              }}
            >
              <Kicker>YOUR PLAN SUMMARY</Kicker>
              <p style={{ margin: "6px 0 0" }}>
                {summary}
                {summaryExtras.length ? ` · ${summaryExtras.join(" · ")}` : ""}
              </p>
            </div>
            <span className="card-meta">
              Device pairing is simulated in this build — real Health Connect
              and HealthKit reads need the native app.
            </span>
          </>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="btn btn-secondary"
            style={{ visibility: step === 0 ? "hidden" : "visible" }}
          >
            ← Back
          </button>
          {step < 6 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(6, s + 1))}
              disabled={!canAdvance}
              className="btn btn-primary"
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={busy}
              className="btn btn-primary"
            >
              {busy ? "Saving…" : "Build my plan ✓"}
            </button>
          )}
        </div>

        {error && (
          <p
            style={{ margin: 0, fontSize: 13, color: "var(--color-accent-700)" }}
            role="alert"
          >
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
