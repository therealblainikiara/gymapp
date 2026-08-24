"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Blueprint, Card, Kicker } from "@/components/ui";
import { FitnessBuddy } from "@/components/fitness-buddy";
import { useProfile } from "@/lib/local/provider";
import { clock } from "@/lib/domain/dates";
import { exerciseSlug, injuryLabel } from "@/lib/domain/exercises";
import { fetchExerciseMedia, type ExerciseMedia } from "@/lib/domain/media";
import { movementRemovalReason } from "@/lib/domain/conditions";
import {
  findRecoveryMove,
  holdSeconds,
  isPerSide,
  type RecoveryMove,
} from "@/lib/domain/recovery";

/**
 * Recovery movement detail — cues, the over-40 safety note, variations, a hold
 * or rep timer, and what the movement needs.
 *
 * Two things it does that the exercise page does not, both because recovery is
 * different rather than because it is lesser:
 *
 *   - **The timer counts down for a hold.** A stopwatch on a 90-second stretch
 *     asks the user to watch the screen and decide when to stop, which is the
 *     decision the dose already made. Rep-based movements still count up.
 *   - **A ruled-out movement names its replacement and links to it.** The
 *     exercise page can only say "not in your plan"; here there is always
 *     somewhere better to send them.
 *
 * No "Do it live" button: the live screen counts reps, which means nothing for
 * a stretch, and pointing a rep counter at a hold would be a worse lie than
 * omitting it.
 */
export default function RecoveryDetail({
  move,
  dose,
}: {
  move: RecoveryMove;
  dose: string;
}) {
  const profile = useProfile();

  const reason = movementRemovalReason(move.contra ?? [], profile);
  const replacement = reason && move.swap ? findRecoveryMove(move.swap) : null;

  const hold = holdSeconds(dose);
  const perSide = isPerSide(dose);

  // Tagged with the movement it belongs to, so navigating between movements
  // reads as "still searching" rather than showing the previous result.
  const [lookup, setLookup] = useState<{
    name: string;
    media: ExerciseMedia | null;
  } | null>(null);
  const media = lookup?.name === move.n ? lookup.media : null;

  // Drainage and breath movements are deliberately not searched. Their names
  // are body-part words — "armpit pump", "abdominal circles" — and the open
  // media libraries answer those with anatomy photographs and worse. The
  // keyword filter and junk-domain blocklist exist because "step up" once
  // resolved to a mass-casualty exercise photo; this is the same failure mode
  // with a much higher cost, so the query is never made.
  const searchable = move.kind !== "drainage" && move.kind !== "breath";
  const loadingMedia = searchable && lookup?.name !== move.n;

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    void fetchExerciseMedia(move.n, controller.signal)
      .then((found) => setLookup({ name: move.n, media: found }))
      .catch(() => {
        // Aborted because the user navigated away; the next screen owns the UI.
      });
    return () => controller.abort();
  }, [move.n, searchable]);

  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running]);

  // A countdown that has reached zero stops itself. Nothing here should need
  // the user to notice and press a button — that is the point of a hold.
  const remaining = hold === null ? null : Math.max(0, hold - seconds);
  if (running && remaining === 0) setRunning(false);

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
        href="/recover"
        className="btn btn-ghost"
        style={{ alignSelf: "flex-start", fontSize: 13 }}
      >
        ← Back to recovery
      </Link>

      <div>
        <Kicker style={{ fontSize: 11 }}>
          {move.kind.toUpperCase()}
          {dose && ` — ${dose.toUpperCase()}`}
        </Kicker>
        <h2 style={{ margin: "4px 0 0", textTransform: "uppercase" }}>
          {move.n}
        </h2>
      </div>

      {reason && (
        <Card
          className="elev-sm"
          role="alert"
          style={{ padding: 14, gap: 8, borderColor: "var(--color-accent)" }}
        >
          <Kicker style={{ alignSelf: "flex-start" }}>WITHHELD</Kicker>
          <span className="card-meta" style={{ margin: 0 }}>
            {reason}
          </span>
          {replacement && (
            <Link
              href={`/recover/${exerciseSlug(replacement.n)}${
                dose ? `?dose=${encodeURIComponent(dose)}` : ""
              }`}
              className="btn btn-secondary"
              style={{ alignSelf: "flex-start", fontSize: 12.5 }}
            >
              Do {replacement.n} instead →
            </Link>
          )}
        </Card>
      )}

      <Card
        className="elev-sm"
        style={{ padding: 14, gap: 6, alignItems: "center" }}
      >
        <Kicker style={{ alignSelf: "flex-start" }}>
          FITNESS BUDDY — MOVEMENT DEMO
        </Kicker>
        <FitnessBuddy exerciseName={move.n} recoveryKind={move.kind} />
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
              alt={`${move.n} demonstration`}
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
        searchable && (
          <Blueprint
            style={{
              aspectRatio: "16/7",
              display: "grid",
              placeItems: "center",
              background: "var(--color-surface)",
            }}
          >
            <span className="card-meta">
              {loadingMedia
                ? "SEARCHING THE OPEN MEDIA LIBRARY…"
                : "NO DEMONSTRATION IMAGE FOUND FOR THIS MOVEMENT"}
            </span>
          </Blueprint>
        )
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
          {move.c.map((cue, i) => (
            <div key={cue} style={{ display: "flex", gap: 8, fontSize: 13.5 }}>
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
          <p style={{ margin: 0, fontSize: 13.5 }}>{move.s}</p>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>
            <span className="text-muted">Easier:</span> {move.e}
          </div>
          <div style={{ fontSize: 12.5 }}>
            <span className="text-muted">Harder:</span> {move.h}
          </div>
        </Card>
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <span className="tag tag-neutral">
          {move.props.length
            ? `NEEDS: ${move.props.join(" · ").toUpperCase()}`
            : "NOTHING NEEDED"}
        </span>
        {move.av.length > 0 && (
          <span className="tag tag-outline">
            {/* Recorded, not filtered on — see the note in recovery-library.ts.
                Someone with a flagged joint should know this reaches it, and
                decide for themselves whether that is a reason to skip. */}
            REACHES: {move.av.map(injuryLabel).join(" · ").toUpperCase()}
          </span>
        )}
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
          <Kicker>{hold === null ? "TIMER" : "HOLD"}</Kicker>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 600,
              fontSize: 44,
              lineHeight: 1,
            }}
          >
            {clock(remaining ?? seconds)}
          </span>
          <span className="card-meta" aria-live="polite">
            {hold === null
              ? dose
                ? `Target ${dose} — counting up`
                : "Counting up"
              : remaining === 0
                ? "Done — swap sides or move on"
                : perSide
                  ? `${dose} — run it twice, once per side`
                  : dose}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              // A finished countdown restarts in one tap rather than two.
              // "45 s / side" is the common case, and making someone press
              // Reset before Start between sides is a tap that exists only
              // because the state machine leaked into the UI.
              if (remaining === 0) setSeconds(0);
              setRunning((r) => (remaining === 0 ? true : !r));
            }}
            className="btn btn-primary"
          >
            {remaining === 0
              ? perSide
                ? "Other side"
                : "Go again"
              : running
                ? "Pause"
                : hold === null
                  ? "Start"
                  : "Start hold"}
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
        </div>
      </Card>
    </div>
  );
}
