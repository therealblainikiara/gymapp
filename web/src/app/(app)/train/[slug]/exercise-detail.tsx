"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Blueprint, CameraIcon, Card, Kicker } from "@/components/ui";
import { FitnessBuddy } from "@/components/fitness-buddy";
import { useProfile } from "@/lib/local/provider";
import { GOALS } from "@/lib/domain/goals";
import { scheme } from "@/lib/domain/plan";
import { clock } from "@/lib/domain/dates";
import {
  fetchExerciseMedia,
  isSearchable,
  type ExerciseMedia,
} from "@/lib/domain/media";
import { movementRemovalReason } from "@/lib/domain/conditions";
import { movementFlags, type Exercise } from "@/lib/domain/exercises";

/**
 * Exercise detail: form cues, the over-40 joint-safety note, easier/harder
 * variations, a set timer, and a demonstration clip when one can be found
 * honestly.
 */
export default function ExerciseDetail({
  exercise,
}: {
  exercise: Exercise & { muscle: string };
}) {
  const router = useRouter();
  const profile = useProfile();
  const goal = GOALS[profile.goal];
  const removedReason = movementRemovalReason(movementFlags(exercise), profile);

  // Tagged with the exercise it belongs to, so switching exercises reads as
  // "still searching" without an effect having to clear the previous result
  // first — and a slow response for the old exercise can never land on the new
  // one's screen.
  const [lookup, setLookup] = useState<{
    name: string;
    media: ExerciseMedia | null;
  } | null>(null);
  const media = lookup?.name === exercise.n ? lookup.media : null;

  // C1: bone-loading drills filter on "drop" and "march", which any parade
  // photograph passes. Skipped rather than searched — see media.ts.
  const searchable = isSearchable(exercise.n);
  const loadingMedia = searchable && lookup?.name !== exercise.n;

  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    void fetchExerciseMedia(exercise.n, controller.signal)
      .then((found) => setLookup({ name: exercise.n, media: found }))
      .catch(() => {
        // Aborted because the user navigated away; the next screen owns the UI.
      });
    return () => controller.abort();
  }, [exercise.n, searchable]);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 760,
        animation: "fadeUp .3s both",
      }}
    >
      <Link
        href="/train"
        className="btn btn-ghost"
        style={{ alignSelf: "flex-start", fontSize: 13 }}
      >
        ← Back to plan
      </Link>

      <div>
        <Kicker style={{ fontSize: 11 }}>
          {exercise.muscle.toUpperCase()} — {scheme(profile.goal, profile.level)}
        </Kicker>
        <h2 style={{ margin: "4px 0 0", textTransform: "uppercase" }}>
          {exercise.n}
        </h2>
      </div>

      {removedReason && (
        <Card
          className="elev-sm"
          role="alert"
          style={{ padding: 14, gap: 6, borderColor: "var(--color-accent)" }}
        >
          <Kicker style={{ alignSelf: "flex-start" }}>WITHHELD</Kicker>
          <span className="card-meta" style={{ margin: 0 }}>
            {removedReason}
          </span>
        </Card>
      )}

      <Card className="elev-sm" style={{ padding: 14, gap: 6, alignItems: "center" }}>
        <Kicker style={{ alignSelf: "flex-start" }}>
          FITNESS BUDDY — MOVEMENT DEMO
        </Kicker>
        <FitnessBuddy exerciseName={exercise.n} />
      </Card>

      {media ? (
        <figure
          className="blueprint duotone"
          style={{ margin: 0, background: "var(--color-surface)" }}
        >
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />
          {media.isVideo ? (
            <video
              src={media.url}
              autoPlay
              loop
              muted
              playsInline
              controls
              style={{
                width: "100%",
                maxHeight: 340,
                objectFit: "contain",
                background: "#000",
                display: "block",
              }}
            />
          ) : (
            // Remote Commons URLs are discovered at runtime and vary per
            // lookup, so next/image's loader has nothing to work with.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.url}
              alt={`${exercise.n} demonstration`}
              style={{
                width: "100%",
                maxHeight: 340,
                objectFit: "contain",
                background: "#fff",
                display: "block",
              }}
            />
          )}
          <figcaption style={{ padding: "6px 10px" }}>
            Demonstration media — Wikimedia Commons
          </figcaption>
        </figure>
      ) : (
        <Blueprint
          style={{
            aspectRatio: "16/7",
            display: "grid",
            placeItems: "center",
            background: "var(--color-surface)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m10 8 6 4-6 4z" />
            </svg>
            <span className="card-meta">
              {loadingMedia
                ? "SEARCHING THE OPEN MEDIA LIBRARY…"
                : "NO DEMONSTRATION IMAGE FOUND FOR THIS MOVEMENT"}
            </span>
          </div>
        </Blueprint>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 14,
        }}
      >
        <Card style={{ padding: 14, gap: 6 }}>
          <Kicker>FORM CUES</Kicker>
          {exercise.c.map((cue, i) => (
            <div
              key={cue}
              style={{ display: "flex", gap: 8, fontSize: 13.5 }}
            >
              <span
                style={{
                  color: "var(--color-accent)",
                  fontFamily: "var(--font-heading)",
                }}
              >
                0{i + 1}
              </span>
              <span>{cue}</span>
            </div>
          ))}
        </Card>

        <Card
          style={{
            padding: 14,
            gap: 6,
            borderLeft: "2px solid var(--color-accent)",
          }}
        >
          <Kicker>JOINT-SAFE NOTE — 40+</Kicker>
          <p style={{ margin: 0, fontSize: 13.5 }}>{exercise.s}</p>
          <div
            style={{
              display: "flex",
              gap: 14,
              marginTop: 4,
              fontSize: 12.5,
            }}
          >
            <span>
              <span className="text-muted">Easier:</span> {exercise.e}
            </span>
          </div>
          <div style={{ fontSize: 12.5 }}>
            <span className="text-muted">Harder:</span> {exercise.h}
          </div>
        </Card>
      </div>

      <Card
        className="elev-sm"
        style={{
          padding: 16,
          gap: 10,
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 130,
          }}
        >
          <Kicker>SET TIMER</Kicker>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 600,
              fontSize: 44,
              lineHeight: 1,
            }}
          >
            {clock(seconds)}
          </span>
          <span className="card-meta">
            Target {scheme(profile.goal, profile.level)} · rest {goal.rest}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="btn btn-primary"
          >
            {running ? "Pause" : "Start set"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRunning(false);
              setSeconds(0);
            }}
            className="btn btn-secondary"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() =>
              router.push(`/live?ex=${encodeURIComponent(exercise.n)}`)
            }
            className="btn btn-secondary"
          >
            <CameraIcon /> Do it live
          </button>
        </div>
      </Card>
    </div>
  );
}
