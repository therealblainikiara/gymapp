"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { Card, Kicker } from "@/components/ui";
import {
  ClinicianClearance,
  DayPicker,
  DeviceList,
  DietaryPicker,
  GoalPicker,
  HealthDeclarations,
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
import {
  declaresProgrammingCondition,
  offersHealthStep,
  offersMenopauseQuestion,
  offersPelvicFloorQuestion,
} from "@/lib/domain/conditions";
import { openLocalDb, readUi, writeUi } from "@/lib/local/db";
import type {
  BoneHealth,
  ConditionKey,
  DietaryKey,
  Goal,
  InjuryKey,
  Kit,
  Level,
  MenopauseStage,
  MuscleKey,
  PelvicFloor,
  PrefTime,
  ProfileRow,
  SessionLen,
} from "@/lib/types/database";

/**
 * The intake questionnaire.
 *
 * Steps are identified by name rather than index, because the health step is
 * conditional on answers given two steps earlier. With an index, changing your
 * age on the About step would silently move you to a different question.
 *
 * Answers are held locally and written once, at "Build my plan", together with
 * `intake_completed_at` — so an abandoned wizard leaves the gate closed rather
 * than producing a half-configured plan.
 */

const PAIRING_MS = 1400;

type StepId =
  | "schedule"
  | "time"
  | "goal"
  | "focus"
  | "dietary"
  | "equipment"
  | "about"
  | "health"
  | "devices";

const STEP_TITLES: Record<StepId, string> = {
  schedule: "Schedule",
  time: "Time",
  goal: "Goal",
  focus: "Focus & injuries",
  dietary: "Dietary",
  equipment: "Equipment",
  about: "About you",
  health: "Health",
  devices: "Devices",
};

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
  age: number | null;
  sex: "m" | "f" | null;
  height_cm: number | null;
  menopause_stage: MenopauseStage | null;
  bone_health: BoneHealth | null;
  pelvic_floor: PelvicFloor | null;
  conditions: ConditionKey[];
}

export default function IntakeWizard({
  userId,
  initial,
}: {
  userId: string;
  initial: ProfileRow | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(!!initial?.clinician_cleared_at);

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
    age: initial?.age ?? null,
    sex: initial?.sex ?? null,
    height_cm: initial?.height_cm ?? null,
    menopause_stage: initial?.menopause_stage ?? null,
    bone_health: initial?.bone_health ?? null,
    pelvic_floor: initial?.pelvic_floor ?? null,
    conditions: initial?.conditions ?? [],
  });

  // Free-text mirrors, so a half-typed number does not become null mid-keystroke.
  const [ageText, setAgeText] = useState(initial?.age ? String(initial.age) : "");
  const [heightText, setHeightText] = useState(
    initial?.height_cm ? String(initial.height_cm) : "",
  );

  const audience = { sex: draft.sex, age: draft.age };
  const steps = useMemo<StepId[]>(() => {
    const base: StepId[] = [
      "schedule",
      "time",
      "goal",
      "focus",
      "dietary",
      "equipment",
      "about",
    ];
    if (offersHealthStep(audience)) base.push("health");
    base.push("devices");
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.sex, draft.age]);

  const [stepId, setStepId] = useState<StepId>("schedule");
  // If the step list changes underfoot — someone went back and set an age that
  // removes the health step — fall back to the first step rather than a blank.
  const index = Math.max(0, steps.indexOf(stepId));
  const current = steps[index] ?? steps[0];
  const isLast = index === steps.length - 1;

  const [devices, setDevices] = useState<Record<string, boolean>>({});
  const [pairing, setPairing] = useState<string | null>(null);
  const pairTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /** Bounded before it can reach the outbox — the column has a CHECK. */
  function commitNumber(raw: string, key: "age" | "height_cm", lo: number, hi: number) {
    const t = raw.trim();
    if (!t) {
      set(key, null);
      return;
    }
    const n = Number(t);
    set(key, Number.isFinite(n) && n >= lo && n <= hi ? n : null);
  }

  const declaresCondition = declaresProgrammingCondition(draft);

  async function finish() {
    setBusy(true);
    setError(null);
    const { error } = await browserClient().from("profiles").upsert(
      {
        id: userId,
        ...draft,
        // Only stamped when something was actually declared — a clearance for
        // nothing is noise in the record.
        clinician_cleared_at:
          declaresCondition && cleared
            ? (initial?.clinician_cleared_at ?? new Date().toISOString())
            : null,
        intake_completed_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
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

  const canAdvance = !(current === "schedule" && draft.avail_days.length === 0);
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
    declaresCondition
      ? cleared
        ? "health declarations active"
        : "health declarations recorded — awaiting clinician confirmation"
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
            BUILDING YOUR PLAN — STEP {index + 1} OF {steps.length} —{" "}
            {STEP_TITLES[current].toUpperCase()}
          </Kicker>
          <span className="card-meta">GYM APP INTAKE</span>
        </div>
        <div style={{ height: 3, border: "1px solid var(--color-divider)" }}>
          <div
            style={{
              height: "100%",
              background: "var(--color-accent)",
              width: `${(((index + 1) / steps.length) * 100).toFixed(0)}%`,
              transition: "width .3s",
            }}
          />
        </div>

        {current === "schedule" && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>
              Your week, honestly
            </h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              Around work and other commitments — which days can you
              realistically train? Your plan schedules sessions only on these
              days; the rest become recovery days.
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

        {current === "time" && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>
              When, and for how long
            </h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              Short and consistent beats long and abandoned.
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

        {current === "goal" && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>Your goal</h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              One primary goal. Everything — sets, reps, rests, calories — is
              drafted from this.
            </p>
            <GoalPicker value={draft.goal} onChange={(v) => set("goal", v)} />
          </>
        )}

        {current === "focus" && (
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

        {current === "dietary" && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>
              Dietary requirements
            </h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              These are treated as{" "}
              <strong>health requirements, not preferences</strong> — meals that
              don&rsquo;t comply are removed entirely. Always verify labels
              yourself.
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

        {current === "equipment" && (
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

        {current === "about" && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>About you</h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              Used for calorie and protein targets, and to decide which health
              questions are worth asking. All optional — the plan works without
              them.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div className="field" style={{ width: 100 }}>
                <label htmlFor="age">Age</label>
                <input
                  id="age"
                  className="input"
                  type="number"
                  inputMode="numeric"
                  value={ageText}
                  onChange={(e) => setAgeText(e.target.value)}
                  onBlur={() => commitNumber(ageText, "age", 13, 120)}
                />
              </div>
              <div className="field" style={{ width: 120 }}>
                <label htmlFor="height">Height (cm)</label>
                <input
                  id="height"
                  className="input"
                  type="number"
                  inputMode="numeric"
                  value={heightText}
                  onChange={(e) => setHeightText(e.target.value)}
                  onBlur={() => commitNumber(heightText, "height_cm", 100, 250)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <h6 style={{ margin: 0 }}>Sex at birth</h6>
                <Segmented
                  name="sex"
                  options={[
                    { id: "m" as const, label: "Male" },
                    { id: "f" as const, label: "Female" },
                  ]}
                  value={draft.sex ?? ("m" as const)}
                  onChange={(v) => set("sex", v)}
                />
              </div>
            </div>
            <span className="card-meta">
              Sex at birth only decides which health questions we offer next —
              never what your plan does. You can set any of those answers
              yourself in Settings regardless.
            </span>
          </>
        )}

        {current === "health" && (
          <>
            <h3 style={{ margin: 0, textTransform: "uppercase" }}>
              Health &amp; life stage
            </h3>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              These change what the plan prescribes — and in one case, what it
              refuses to prescribe. Everything here is optional.
            </p>
            <HealthDeclarations
              value={draft}
              onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              offerMenopause={offersMenopauseQuestion(audience)}
              offerPelvicFloor={offersPelvicFloorQuestion(audience)}
            />
            {declaresCondition && (
              <ClinicianClearance cleared={cleared} onChange={setCleared} />
            )}
          </>
        )}

        {current === "devices" && (
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
            onClick={() => setStepId(steps[Math.max(0, index - 1)])}
            className="btn btn-secondary"
            style={{ visibility: index === 0 ? "hidden" : "visible" }}
          >
            ← Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={finish}
              disabled={busy}
              className="btn btn-primary"
            >
              {busy ? "Saving…" : "Build my plan ✓"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                setStepId(steps[Math.min(steps.length - 1, index + 1)])
              }
              disabled={!canAdvance}
              className="btn btn-primary"
            >
              Next →
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
