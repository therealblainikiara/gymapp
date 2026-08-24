"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import { useGym, useProfile, useStore } from "@/lib/local/provider";
import { browserClient } from "@/lib/supabase/client";
import {
  conditionProgrammingActive,
  declaresProgrammingCondition,
} from "@/lib/domain/conditions";

const PAIRING_MS = 1400;

/**
 * Setup — every pick that drives the plan, plus the account controls.
 *
 * Each change is written straight through the store, so the plan and meals
 * redraw immediately and the write syncs in the background. There is no Save
 * button because there is nothing to save: the prototype behaved the same way,
 * and a Save button on a screen that already applied the change is a lie.
 */
export default function SetupScreen() {
  const store = useStore();
  const profile = useProfile();
  const { ui, pending, status, lastError, legacyReport } = useGym();

  const [pairing, setPairing] = useState<string | null>(null);
  const pairTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [handle, setHandle] = useState(profile.handle ?? "");
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [handleError, setHandleError] = useState<string | null>(null);

  // These two inputs are drafts over synced values, so a pull from another
  // device has to be able to move them. Reconciling during render rather than
  // in an effect avoids a frame showing the stale text.
  const [syncedIdentity, setSyncedIdentity] = useState({
    handle: profile.handle,
    display_name: profile.display_name,
  });
  if (
    syncedIdentity.handle !== profile.handle ||
    syncedIdentity.display_name !== profile.display_name
  ) {
    setSyncedIdentity({
      handle: profile.handle,
      display_name: profile.display_name,
    });
    setHandle(profile.handle ?? "");
    setDisplayName(profile.display_name ?? "");
  }

  useEffect(
    () => () => {
      if (pairTimer.current) clearTimeout(pairTimer.current);
    },
    [],
  );

  function toggleDevice(id: string) {
    if (ui.devices[id]) {
      void store.toggleDevice(id);
      return;
    }
    if (pairing) return;
    setPairing(id);
    pairTimer.current = setTimeout(() => {
      void store.toggleDevice(id);
      setPairing(null);
    }, PAIRING_MS);
  }

  /**
   * The handle is the only field with a uniqueness constraint, so it is the
   * only one that can fail for a reason the user needs to hear about. It goes
   * straight to the server rather than through the outbox — a queued handle
   * that turns out to be taken would surface as a silent sync error days later.
   */
  async function saveHandle() {
    const trimmed = handle.trim().toLowerCase();
    if (trimmed === (profile.handle ?? "")) return;
    if (trimmed && !/^[a-z0-9_]{3,24}$/.test(trimmed)) {
      setHandleError(
        "Handles are 3–24 characters: lower-case letters, numbers and underscores.",
      );
      return;
    }
    const { error } = await browserClient()
      .from("profiles")
      .update({ handle: trimmed || null })
      .eq("id", profile.id);
    if (error) {
      setHandleError(
        error.code === "23505"
          ? "That handle is already taken."
          : error.message,
      );
      return;
    }
    setHandleError(null);
    void store.sync();
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        maxWidth: 760,
        animation: "fadeUp .3s both",
      }}
    >
      <p className="text-muted" style={{ margin: 0 }}>
        Your picks drive everything — plan, meals and schedule redraw instantly.
      </p>

      <Section title="Fitness goal">
        <GoalPicker
          value={profile.goal}
          onChange={(goal) => void store.patchProfile({ goal })}
        />
      </Section>

      <Section
        title="Training days"
        hint="— pick the days you can realistically train"
      >
        <DayPicker
          compact
          value={profile.avail_days}
          onChange={(avail_days) => void store.patchProfile({ avail_days })}
        />
      </Section>

      <Section title="Muscle focus" hint="— none selected = full body">
        <MusclePicker
          value={profile.muscles}
          onChange={(muscles) => void store.patchProfile({ muscles })}
        />
      </Section>

      <Section
        title="Injuries / sensitive areas"
        hint="— exercises that load these are removed"
      >
        <InjuryPicker
          value={profile.injuries}
          onChange={(injuries) => void store.patchProfile({ injuries })}
        />
      </Section>

      <Section
        title="Dietary health requirements"
        hint="— hard filters, not preferences"
      >
        <DietaryPicker
          value={profile.dietary}
          onChange={(dietary) => void store.patchProfile({ dietary })}
        />
      </Section>

      <Section
        title="Health &amp; life stage"
        hint="— these change what the plan prescribes"
      >
        <HealthDeclarations
          value={profile}
          onChange={(patch) => void store.patchProfile(patch)}
          // Setup always offers everything. The age and sex thresholds only
          // decide what intake bothers to ask — someone who is 38 with
          // osteoporosis still has to be able to say so.
          offerMenopause
          offerPelvicFloor
        />
        {declaresProgrammingCondition(profile) && (
          <ClinicianClearance
            cleared={!!profile.clinician_cleared_at}
            onChange={(next) =>
              void store.patchProfile({
                clinician_cleared_at: next ? new Date().toISOString() : null,
              })
            }
          />
        )}
        <span className="card-meta">
          {conditionProgrammingActive(profile)
            ? "Your plan is adjusted for these."
            : declaresProgrammingCondition(profile)
              ? "Recorded, but not yet shaping your plan — tick the clinician box above."
              : "Nothing declared. You are on the standard over-40s plan."}
        </span>
      </Section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <Field label="Level">
          <Segmented
            name="level"
            options={LEVEL_OPTIONS}
            value={profile.level}
            onChange={(level) => void store.patchProfile({ level })}
          />
        </Field>
        <Field label="Equipment">
          <Segmented
            name="kit"
            options={KIT_OPTIONS}
            value={profile.kit}
            onChange={(kit) => void store.patchProfile({ kit })}
          />
        </Field>
        <Field label="Session length">
          <Segmented
            name="len"
            options={LEN_OPTIONS}
            value={profile.session_len}
            onChange={(session_len) => void store.patchProfile({ session_len })}
          />
        </Field>
        <Field label="Preferred time">
          <Segmented
            name="ptime"
            options={TIME_OPTIONS}
            value={profile.pref_time}
            onChange={(pref_time) => void store.patchProfile({ pref_time })}
          />
        </Field>
      </div>

      <Section
        title="Your profile"
        hint="— a handle is what lets training partners find you"
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label htmlFor="display-name">Display name</label>
            <input
              id="display-name"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={() =>
                void store.patchProfile({
                  display_name: displayName.trim() || null,
                })
              }
            />
          </div>
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label htmlFor="handle">Handle</label>
            <input
              id="handle"
              className="input"
              placeholder="e.g. alex_lifts"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onBlur={saveHandle}
            />
          </div>
        </div>
        {handleError && (
          <span className="card-meta" role="alert">
            {handleError}
          </span>
        )}
        <span className="card-meta">
          Leave the handle blank to stay undiscoverable. Search only ever
          returns a name and a handle — never your health data.
        </span>
      </Section>

      <Section title="Connected devices">
        <DeviceList
          linked={ui.devices}
          pairing={pairing}
          onToggle={toggleDevice}
        />
        <span className="card-meta">
          Device pairing and readings are simulated in this build, and stay on
          this device. Real Health Connect and HealthKit reads need the native
          app.
        </span>
      </Section>

      <Section title="Sync">
        <span className="card-meta">
          {status === "offline"
            ? `Offline — ${pending} change(s) saved here and queued.`
            : pending > 0
              ? `${pending} change(s) syncing.`
              : "Everything on this device is synced."}
        </span>
        {lastError && (
          <span className="card-meta" role="alert">
            Last sync problem: {lastError}
          </span>
        )}
        {legacyReport && (
          <span className="card-meta">
            Imported {legacyReport.imported} row(s) from the browser prototype.
            {Object.keys(legacyReport.dropped).length > 0 &&
              ` Skipped unreadable rows: ${Object.entries(legacyReport.dropped)
                .map(([t, n]) => `${n} ${t}`)
                .join(", ")}.`}
          </span>
        )}
        <button
          type="button"
          onClick={() => void store.sync()}
          className="btn btn-secondary"
          style={{ alignSelf: "flex-start", fontSize: 12.5, padding: "4px 10px" }}
        >
          Sync now
        </button>
      </Section>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/intake" className="btn btn-secondary">
          Redo the intake questionnaire
        </Link>
        <Link href="/disclaimer" className="btn btn-ghost">
          Re-read the disclaimer
        </Link>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="btn btn-ghost">
            Sign out
          </button>
        </form>
      </div>

      <p className="card-meta" style={{ margin: 0 }}>
        Gym App is not medical advice — you use it at your own risk and accept
        all responsibility, as per the disclaimer you accepted
        {profile.disclaimer_accepted_at
          ? ` on ${new Date(profile.disclaimer_accepted_at).toLocaleDateString()}`
          : ""}
        .
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h6 style={{ margin: "0 0 2px" }}>
        {title}
        {hint && (
          <span
            className="text-muted"
            style={{
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            {" "}
            {hint}
          </span>
        )}
      </h6>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h6 style={{ margin: 0 }}>{label}</h6>
      {children}
    </div>
  );
}
