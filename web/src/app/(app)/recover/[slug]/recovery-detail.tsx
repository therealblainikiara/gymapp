"use client";

import { useMemo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Blueprint, Card, Kicker } from "@/components/ui";
import { FitnessBuddy } from "@/components/fitness-buddy";
import { useProfile, useStore } from "@/lib/local/provider";
import { clock } from "@/lib/domain/dates";
import { exerciseSlug, injuryLabel } from "@/lib/domain/exercises";
import {
  fetchExerciseMedia,
  isSearchable,
  type ExerciseMedia,
} from "@/lib/domain/media";
import { movementRemovalReason } from "@/lib/domain/conditions";
import {
  findRecoveryMove,
  holdSeconds,
  isPerSide,
  type RecoveryMove,
} from "@/lib/domain/recovery";
import {
  buildRecovery,
  locateInSession,
  sessionHref,
} from "@/lib/domain/recovery-plan";

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
  slug,
  day,
  i,
}: {
  move: RecoveryMove;
  dose: string;
  slug: string;
  day?: string;
  i?: string;
}) {
  const profile = useProfile();
  const store = useStore();
  const router = useRouter();

  // The week is regenerated here rather than passed through the URL: it depends
  // on the profile, the profile lives in the local store, and a position that
  // no longer matches is better ignored than followed.
  const at = useMemo(() => {
    const days = buildRecovery({
      bone_health: profile.bone_health,
      pelvic_floor: profile.pelvic_floor,
      session_len: profile.session_len,
      level: profile.level,
      avail_days: profile.avail_days,
    });
    return locateInSession(days, day, i, slug, exerciseSlug);
  }, [
    profile.bone_health,
    profile.pelvic_floor,
    profile.session_len,
    profile.level,
    profile.avail_days,
    day,
    i,
    slug,
  ]);

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

  // Two reasons a movement is never searched, and both live in `media.ts` now
  // rather than here. By kind: drainage and breath names are body-part words —
  // "armpit pump", "abdominal circles" — and open media libraries answer those
  // with anatomy photographs and worse. By name: C1 found several whose
  // discriminating word is short enough that the relevance filter drops it,
  // leaving an animal or a person as the only thing it checks for.
  const searchable =
    move.kind !== "drainage" &&
    move.kind !== "breath" &&
    isSearchable(move.n);
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

      {at && (
        <div
          style={{
            display: "flex",
            gap: 4,
            alignItems: "center",
            flexWrap: "wrap",
          }}
          aria-label={`Movement ${at.index + 1} of ${at.day.moves.length}`}
        >
          {at.day.moves.map((m, n) => (
            <span
              key={m.n}
              style={{
                height: 4,
                flex: 1,
                minWidth: 18,
                borderRadius: 2,
                background:
                  n <= at.index
                    ? "var(--color-accent)"
                    : "color-mix(in srgb, var(--color-text) 12%, transparent)",
              }}
            />
          ))}
        </div>
      )}

      <div>
        <Kicker style={{ fontSize: 11 }}>
          {at
            ? `${at.day.routine.toUpperCase()} — ${at.index + 1} OF ${at.day.moves.length}`
            : move.kind.toUpperCase()}
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

      {at && (
        <Card className="elev-sm" style={{ padding: 14, gap: 10 }}>
          <Kicker>{at.isLast ? "LAST MOVEMENT" : "NEXT UP"}</Kicker>
          {at.next && (
            <span className="card-meta" style={{ margin: 0 }}>
              {at.next.n} — {at.next.dose}
            </span>
          )}
          {at.isLast ? (
            <button
              type="button"
              onClick={() => {
                // The whole point of C32: a stretch session can be started,
                // followed and logged without ever opening a workout.
                void store.logRecovery(at.day.minutes);
                router.push("/recover");
              }}
              className="btn btn-primary"
              style={{ alignSelf: "flex-start" }}
            >
              Finish and log ✓
            </button>
          ) : (
            <Link
              href={sessionHref(
                at.dayIndex,
                at.index + 1,
                at.next!,
                exerciseSlug,
              )}
              className="btn btn-primary"
              style={{ alignSelf: "flex-start" }}
            >
              Next movement →
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}
