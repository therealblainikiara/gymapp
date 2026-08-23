"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CameraIcon, Card, Kicker } from "@/components/ui";
import { useGym, useProfile, useStore } from "@/lib/local/provider";
import { buildPlan } from "@/lib/domain/plan";
import { EXERCISE_DB } from "@/lib/domain/exercises";
import { exerciseSlug, injuryLabel } from "@/lib/domain/exercises";
import { GOALS } from "@/lib/domain/goals";

/**
 * Train — the week's plan, generated client-side from the profile by the same
 * generator the prototype used. Tapping an exercise opens its detail screen;
 * "Mark session done" writes an event, which is what feeds the streak, the
 * weekly counter and the challenge.
 */
export default function TrainScreen() {
  const router = useRouter();
  const store = useStore();
  const profile = useProfile();
  const { status } = useGym();

  const days = useMemo(() => buildPlan(profile), [profile]);
  const goal = GOALS[profile.goal];
  const focus = (profile.muscles.length ? profile.muscles : ["full" as const])
    .map((m) => EXERCISE_DB[m].label)
    .join(" · ");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        animation: "fadeUp .3s both",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h3 style={{ margin: 0, textTransform: "uppercase" }}>{goal.split}</h3>
          <span className="card-meta">
            {Math.max(1, profile.avail_days.length)} sessions / week
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 7,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span className="tag tag-accent">{goal.label}</span>
          <span className="tag tag-neutral">{focus}</span>
          <span className="tag tag-outline">{profile.session_len} MIN</span>
          {profile.injuries.length > 0 && (
            <span className="tag tag-neutral">
              WORKING AROUND:{" "}
              {profile.injuries.map(injuryLabel).join(" · ").toUpperCase()}
            </span>
          )}
          <button
            type="button"
            onClick={() => router.push("/live")}
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: "2px 8px" }}
          >
            <CameraIcon size={13} /> Live
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))",
          gap: 22,
        }}
      >
        {days.map((d) => (
          <Card
            key={d.label}
            className="elev-sm"
            style={{
              gap: 10,
              padding: 16,
              animation: `fadeUp .4s ${d.delay} both`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Kicker style={{ fontSize: 11 }}>{d.label}</Kicker>
              <span className="tag tag-neutral">{d.focus}</span>
            </div>
            <div
              className="card-meta"
              style={{
                borderBottom: "1px solid var(--color-divider)",
                paddingBottom: 7,
              }}
            >
              Joint-friendly warm-up — 5 min easy movement first
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {d.exercises.map((ex, i) =>
                ex.isFinisher ? (
                  // Finishers are prescriptions, not library entries, so they
                  // have no detail page to link to.
                  <div
                    key={`${ex.name}-${i}`}
                    className="gym-exrow"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      width: "100%",
                      padding: "7px 2px",
                      borderBottom:
                        "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                      fontSize: 13.5,
                    }}
                  >
                    <span>{ex.name}</span>
                    <span style={{ whiteSpace: "nowrap", opacity: 0.7 }}>
                      {ex.scheme} · rest {ex.rest}
                    </span>
                  </div>
                ) : (
                  <Link
                    key={`${ex.name}-${i}`}
                    href={`/train/${exerciseSlug(ex.name)}`}
                    className="gym-rowbtn gym-exrow"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      width: "100%",
                      padding: "7px 2px",
                      borderBottom:
                        "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                      fontSize: 13.5,
                    }}
                  >
                    <span style={{ color: "var(--color-accent-700)" }}>
                      {ex.name}
                    </span>
                    <span style={{ whiteSpace: "nowrap", opacity: 0.7 }}>
                      {ex.scheme} · rest {ex.rest}
                    </span>
                  </Link>
                ),
              )}
            </div>
            <p className="card-meta" style={{ margin: 0 }}>
              {d.tip}
            </p>
            <button
              type="button"
              onClick={() => void store.logSession(profile.session_len)}
              disabled={status === "loading"}
              className="btn btn-secondary"
              style={{ fontSize: 12.5, padding: "5px 10px" }}
            >
              Mark session done ✓
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
