"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Blueprint, Card, Kicker } from "@/components/ui";
import { useGym, useProfile, useStore } from "@/lib/local/provider";
import { CAM_TIPS } from "@/lib/domain/recovery";
import { injuryLabel } from "@/lib/domain/exercises";

/**
 * Live workout — real webcam self-view, real MediaRecorder capture, and real
 * coach feedback from the server route.
 *
 * What is honest about this screen: the video never leaves the device, and the
 * rep counter and heart rate are simulated. Pose-based rep counting is C18;
 * heart rate needs the phone link (M4). The copy at the bottom says both out
 * loud rather than letting the numbers imply a measurement.
 */

/** The prototype's simulated cadence: one rep every 2.8 s. */
const REP_INTERVAL_MS = 2800;

export default function LiveCamera({
  exerciseName,
}: {
  exerciseName: string;
}) {
  const router = useRouter();
  const store = useStore();
  const profile = useProfile();
  const { ui } = useGym();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const repTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const setStart = useRef<number>(0);
  const clipUrlRef = useRef<string | null>(null);

  const [camError, setCamError] = useState(false);
  const [reps, setReps] = useState(0);
  const [setOn, setSetOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);

  const showHr = !!(ui.devices.watch || ui.devices.phone);

  const stopEverything = useCallback(() => {
    if (repTimer.current) clearInterval(repTimer.current);
    if (recorderRef.current?.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {
        // Already torn down by the track stopping; nothing to recover.
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setCamError(true);
      }
    })();
    return () => {
      cancelled = true;
      stopEverything();
    };
  }, [stopEverything]);

  // Revoke the object URL when it is replaced or the screen closes, otherwise
  // each recorded clip leaks its blob for the lifetime of the tab.
  useEffect(() => {
    clipUrlRef.current = clipUrl;
    return () => {
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    };
  }, [clipUrl]);

  async function endSet() {
    if (repTimer.current) clearInterval(repTimer.current);
    const seconds = Math.max(
      1,
      Math.round((Date.now() - (setStart.current || Date.now())) / 1000),
    );
    setSetOn(false);
    setTip("Coach is reviewing your set…");

    const fallback = CAM_TIPS[Math.floor(Math.random() * CAM_TIPS.length)];
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          exercise: exerciseName,
          reps,
          seconds,
          goal: profile.goal,
          level: profile.level,
          injuries: profile.injuries.map(injuryLabel),
        }),
      });
      const json = (await res.json()) as { tip?: string | null };
      setTip(json.tip || fallback);
    } catch {
      setTip(fallback);
    }
  }

  function toggleSet() {
    if (setOn) {
      void endSet();
      return;
    }
    setStart.current = Date.now();
    setReps(0);
    setTip(null);
    setSetOn(true);
    repTimer.current = setInterval(
      () => setReps((r) => r + 1),
      REP_INTERVAL_MS,
    );
  }

  function toggleRecording() {
    if (recording) {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      setRecording(false);
      return;
    }
    if (!streamRef.current) return;
    try {
      chunksRef.current = [];
      const rec = new MediaRecorder(streamRef.current);
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setClipUrl(URL.createObjectURL(blob));
      };
      rec.start();
      recorderRef.current = rec;
      setClipUrl(null);
      setRecording(true);
    } catch {
      // MediaRecorder is unavailable (older Safari); self-view still works.
    }
  }

  function close() {
    stopEverything();
    router.push("/train");
  }

  const liveHr = setOn ? Math.min(148, 96 + reps * 3 + (reps % 2 ? 3 : 0)) : 72;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        maxWidth: 860,
        animation: "fadeUp .3s both",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <Kicker style={{ fontSize: 11 }}>LIVE WORKOUT — CAMERA</Kicker>
          <h3 style={{ margin: "2px 0 0", textTransform: "uppercase" }}>
            Form check mode
          </h3>
        </div>
        <button type="button" onClick={close} className="btn btn-secondary">
          Close ✕
        </button>
      </div>

      {camError && (
        <Card style={{ padding: 16 }}>
          <p style={{ margin: 0 }}>
            Camera unavailable — check browser permissions, then close and
            reopen live mode.
          </p>
        </Card>
      )}

      <Blueprint
        style={{
          position: "relative",
          background: "var(--color-neutral-900)",
          aspectRatio: "16/9",
          overflow: "visible",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
          }}
        />
        {showGuide && (
          <svg
            viewBox="0 0 100 100"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
            preserveAspectRatio="xMidYMax meet"
            aria-hidden="true"
          >
            <g
              fill="none"
              stroke="var(--color-accent-300)"
              strokeWidth="0.8"
              strokeDasharray="2 2"
              opacity="0.9"
            >
              <circle cx="50" cy="22" r="7" />
              <line x1="50" y1="29" x2="50" y2="58" />
              <line x1="50" y1="36" x2="34" y2="50" />
              <line x1="50" y1="36" x2="66" y2="50" />
              <line x1="50" y1="58" x2="40" y2="82" />
              <line x1="50" y1="58" x2="60" y2="82" />
              <line x1="40" y1="82" x2="38" y2="96" />
              <line x1="60" y1="82" x2="62" y2="96" />
            </g>
          </svg>
        )}
        <div style={{ position: "absolute", top: 12, right: 14, textAlign: "right" }}>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 600,
              fontSize: 52,
              lineHeight: 1,
              color: "var(--color-bg)",
              textShadow: "0 1px 4px rgba(0,0,0,.5)",
            }}
          >
            {reps}
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.1em",
              color: "var(--color-accent-300)",
            }}
          >
            REPS (SIMULATED)
          </div>
        </div>
        {showHr && (
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 14,
              color: "var(--color-bg)",
              textShadow: "0 1px 4px rgba(0,0,0,.5)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
                fontSize: 30,
              }}
            >
              {liveHr}
            </span>
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.1em",
                color: "var(--color-accent-300)",
              }}
            >
              {" "}
              BPM — SIMULATED
            </span>
          </div>
        )}
        {recording && (
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#fff",
              fontSize: 11,
              letterSpacing: "0.1em",
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "#c0392b",
              }}
            />
            REC
          </div>
        )}
      </Blueprint>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={toggleSet}
          className="btn btn-primary"
          style={{ flex: 1, minWidth: 140 }}
        >
          {setOn ? "End set → get feedback" : "Start set"}
        </button>
        <button
          type="button"
          onClick={toggleRecording}
          className="btn btn-secondary"
        >
          {recording ? "■ Stop recording" : "● Record set"}
        </button>
        <button
          type="button"
          onClick={() => setShowGuide((g) => !g)}
          className="btn btn-secondary"
        >
          {showGuide ? "Hide posture guide" : "Posture guide"}
        </button>
        <button
          type="button"
          onClick={() => void store.logSession(profile.session_len)}
          className="btn btn-secondary"
        >
          Log session ✓
        </button>
      </div>

      {tip && (
        <Card
          style={{
            padding: 14,
            gap: 4,
            borderLeft: "2px solid var(--color-accent)",
          }}
        >
          <Kicker>COACH FEEDBACK — AI</Kicker>
          <p style={{ margin: 0, fontSize: 14 }}>{tip}</p>
        </Card>
      )}

      {clipUrl && (
        <Card style={{ padding: 14, gap: 8 }}>
          <Kicker>REVIEW YOUR SET</Kicker>
          <video
            src={clipUrl}
            controls
            style={{ width: "100%", maxWidth: 480, background: "#000" }}
          />
        </Card>
      )}

      <p className="card-meta" style={{ margin: 0 }}>
        Video stays on this device — nothing is uploaded. Coach feedback is
        generated by an AI model from your set statistics only. Rep counting and
        heart rate are simulated until pose tracking and the phone link (Android
        Health Connect first) are built.
      </p>
    </div>
  );
}
