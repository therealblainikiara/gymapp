"use client";

import type { CSSProperties } from "react";
import { toggleStyle } from "./ui";
import { DAY_NAMES } from "@/lib/domain/dates";
import { GOALS, GOAL_KEYS } from "@/lib/domain/goals";
import { EXERCISE_DB, INJURIES, MUSCLE_KEYS } from "@/lib/domain/exercises";
import { DIETARY } from "@/lib/domain/meals";
import { DEVICES } from "@/lib/domain/recovery";
import {
  BONE_HEALTH_OPTIONS,
  CONDITIONS,
  MENOPAUSE_OPTIONS,
  PELVIC_FLOOR_OPTIONS,
} from "@/lib/domain/conditions";
import type {
  BoneHealth,
  ConditionKey,
  DietaryKey,
  Goal,
  MenopauseStage,
  PelvicFloor,
  InjuryKey,
  Kit,
  Level,
  MuscleKey,
  PrefTime,
  SessionLen,
} from "@/lib/types/database";

/**
 * The pickers the intake wizard and the Setup screen share. The prototype had
 * both screens rendering the same controls from the same `renderVals` output;
 * keeping them as one component is how that stays true as the app changes.
 */

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function DayPicker({
  value,
  onChange,
  compact = false,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      {DAY_NAMES.map((label, i) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(toggle(value, i).sort((a, b) => a - b))}
          aria-pressed={value.includes(i)}
          className="btn"
          style={{
            width: compact ? 56 : 64,
            flexDirection: "column",
            gap: 0,
            padding: compact ? "6px 0" : "8px 0",
            fontSize: compact ? 12.5 : undefined,
            ...toggleStyle(value.includes(i)),
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function GoalPicker({
  value,
  onChange,
}: {
  value: Goal;
  onChange: (next: Goal) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))",
        gap: 8,
      }}
    >
      {GOAL_KEYS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className="btn"
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 1,
            padding: "9px 12px",
            transition: "background .15s,color .15s,border-color .15s",
            ...toggleStyle(value === id),
          }}
        >
          <span style={{ fontSize: 15, letterSpacing: "0.02em" }}>
            {GOALS[id].label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 400,
              fontSize: 11.5,
              opacity: 0.72,
              textAlign: "left",
            }}
          >
            {GOALS[id].desc}
          </span>
        </button>
      ))}
    </div>
  );
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
  chipStyle,
}: {
  options: ReadonlyArray<readonly [T, string]>;
  value: T[];
  onChange: (next: T[]) => void;
  chipStyle?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(toggle(value, id))}
          aria-pressed={value.includes(id)}
          className="btn"
          style={{
            padding: "4px 11px",
            fontSize: 12.5,
            ...chipStyle,
            ...toggleStyle(value.includes(id)),
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function MusclePicker({
  value,
  onChange,
}: {
  value: MuscleKey[];
  onChange: (next: MuscleKey[]) => void;
}) {
  const options = MUSCLE_KEYS.map(
    (k) => [k, EXERCISE_DB[k].label] as const,
  );
  return <ChipRow options={options} value={value} onChange={onChange} />;
}

export function InjuryPicker({
  value,
  onChange,
}: {
  value: InjuryKey[];
  onChange: (next: InjuryKey[]) => void;
}) {
  return <ChipRow options={INJURIES} value={value} onChange={onChange} />;
}

export function DietaryPicker({
  value,
  onChange,
  large = false,
}: {
  value: DietaryKey[];
  onChange: (next: DietaryKey[]) => void;
  large?: boolean;
}) {
  return (
    <ChipRow
      options={DIETARY}
      value={value}
      onChange={onChange}
      chipStyle={large ? { padding: "6px 13px", fontSize: 13 } : undefined}
    />
  );
}

export function Segmented<T extends string | number>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <label key={String(o.id)} className="seg-opt">
          <input
            type="radio"
            name={name}
            value={String(o.id)}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export const LEVEL_OPTIONS = (["beginner", "intermediate", "advanced"] as Level[]).map(
  (id) => ({ id, label: id[0].toUpperCase() + id.slice(1, 3) }),
);

export const KIT_OPTIONS: { id: Kit; label: string }[] = [
  { id: "bw", label: "Bodyweight" },
  { id: "dbbw", label: "+ Dumbbells" },
];

export const LEN_OPTIONS: { id: SessionLen; label: string }[] = (
  [10, 20, 30, 45, 60] as SessionLen[]
).map((n) => ({ id: n, label: `${n}′` }));

export const TIME_OPTIONS: { id: PrefTime; label: string }[] = [
  { id: "morning", label: "Morning" },
  { id: "lunch", label: "Lunchtime" },
  { id: "evening", label: "Evening" },
];

/**
 * Simulated device pairing. Real Health Connect / HealthKit reads need a
 * native wrapper (M4), so these flags stay on the device and are labelled as
 * simulated everywhere they appear.
 */
export function DeviceList({
  linked,
  pairing,
  onToggle,
}: {
  linked: Record<string, boolean>;
  pairing: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {DEVICES.map((dev) => {
        const isPairing = pairing === dev.id;
        const on = !!linked[dev.id];
        return (
          <div
            key={dev.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: "1px solid var(--color-divider)",
              padding: "10px 12px",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                {dev.n}
              </div>
              <div className="card-meta">{dev.d}</div>
            </div>
            <span className={`tag ${on ? "tag-accent" : "tag-neutral"}`}>
              {isPairing ? "PAIRING…" : on ? "CONNECTED" : "NOT LINKED"}
            </span>
            <button
              type="button"
              onClick={() => onToggle(dev.id)}
              disabled={isPairing}
              className="btn btn-secondary"
              style={{ fontSize: 12.5, padding: "4px 10px" }}
            >
              {isPairing ? "Pairing…" : on ? "Disconnect" : "Connect"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── M6 / C19 — health declarations ──────────────────────────────────────────

/**
 * The health block, shared by intake and Setup so the two cannot drift.
 *
 * `offerMenopause` and `offerPelvicFloor` are passed in rather than derived
 * here: intake asks only what is relevant to the person, Setup always shows
 * everything, and the component should not have to know which caller it is.
 */
export function HealthDeclarations({
  value,
  onChange,
  offerMenopause,
  offerPelvicFloor,
}: {
  value: {
    menopause_stage: MenopauseStage | null;
    bone_health: BoneHealth | null;
    pelvic_floor: PelvicFloor | null;
    conditions: ConditionKey[];
  };
  onChange: (patch: Partial<typeof value>) => void;
  offerMenopause: boolean;
  offerPelvicFloor: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {offerMenopause && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h6 style={{ margin: 0 }}>Menopause stage</h6>
          <OptionChips
            options={MENOPAUSE_OPTIONS}
            value={value.menopause_stage}
            onChange={(menopause_stage) => onChange({ menopause_stage })}
          />
          <span className="card-meta">
            Perimenopause changes how bone, recovery and training load respond —
            it is the single most useful thing you can tell us here.
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h6 style={{ margin: 0 }}>Bone health</h6>
        <OptionChips
          options={BONE_HEALTH_OPTIONS}
          value={value.bone_health}
          onChange={(bone_health) => onChange({ bone_health })}
        />
        <span className="card-meta">
          With osteoporosis we remove movements that load the spine in flexion
          or rotation. &ldquo;Never tested&rdquo; is a real answer — we treat it
          differently from a clear scan.
        </span>
      </div>

      {offerPelvicFloor && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h6 style={{ margin: 0 }}>Pelvic floor</h6>
          <OptionChips
            options={PELVIC_FLOOR_OPTIONS}
            value={value.pelvic_floor}
            onChange={(pelvic_floor) => onChange({ pelvic_floor })}
          />
          <span className="card-meta">
            Affects impact work and heavy bracing. Common, treatable, and worth
            saying.
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h6 style={{ margin: 0 }}>
          Diagnosed conditions{" "}
          <span
            className="text-muted"
            style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}
          >
            — select any that apply
          </span>
        </h6>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CONDITIONS.map((c) => {
            const on = value.conditions.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    conditions: on
                      ? value.conditions.filter((x) => x !== c.id)
                      : [...value.conditions, c.id],
                  })
                }
                className="btn"
                style={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 1,
                  padding: "8px 12px",
                  ...toggleStyle(on),
                }}
              >
                <span style={{ fontSize: 14 }}>{c.label}</span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 400,
                    fontSize: 11.5,
                    opacity: 0.72,
                    textAlign: "left",
                  }}
                >
                  {c.note}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Single-select chips for the three either/or health fields. */
function OptionChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T | null;
  onChange: (next: T) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className="btn"
          style={{
            padding: "5px 12px",
            fontSize: 12.5,
            ...toggleStyle(value === o.id),
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The clearance gate. Condition-specific programming does not run until this is
 * ticked — a self-reported diagnosis is enough to ask about, not enough to
 * program on.
 */
export function ClinicianClearance({
  cleared,
  onChange,
}: {
  cleared: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--color-accent)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <label className="radio" style={{ alignItems: "flex-start", gap: 10 }}>
        <input
          type="checkbox"
          checked={cleared}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className="dot"
          style={{
            borderRadius: 0,
            background: cleared ? "var(--color-accent)" : "transparent",
            borderColor: cleared
              ? "var(--color-accent)"
              : "var(--color-divider)",
          }}
        />
        <span style={{ fontSize: 13.5 }}>
          I have discussed exercising with these conditions with a doctor or
          physiotherapist, and they are happy for me to train.
        </span>
      </label>
      <span className="card-meta">
        Until this is ticked you get the standard over-40s plan. We will not
        change your programme on the strength of a tick-box alone.
      </span>
    </div>
  );
}
