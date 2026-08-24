"use client";

import { buddyFor, buddyForRecovery } from "@/lib/domain/buddy";
import type { RecoveryKind } from "@/lib/domain/recovery";

/**
 * The Mii-style fitness buddy that acts out the movement pattern.
 *
 * Still the CSS figure from the prototype, not the rigged three.js character
 * the user asked for — that is C16 in ECC-PLAN.md and explicitly out of M2.
 * Kept intact here so the port is 1:1 and C16 has something to replace.
 */
export function FitnessBuddy({
  exerciseName,
  recoveryKind,
}: {
  exerciseName: string;
  /** Set for recovery movements, which are dispatched on kind, not on name. */
  recoveryKind?: RecoveryKind;
}) {
  const b = recoveryKind
    ? buddyForRecovery(recoveryKind)
    : buddyFor(exerciseName);
  return (
    <>
      <div
        style={{
          height: 240,
          display: "grid",
          placeItems: "center",
          perspective: 600,
          overflow: "hidden",
        }}
        role="img"
        aria-label={`Animated demonstration. ${b.label}`}
      >
        <div
          style={{
            position: "relative",
            width: 130,
            height: 212,
            transformStyle: "preserve-3d",
            transform: "rotateY(-14deg)",
            animation: b.group,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--color-neutral-300)",
              boxShadow:
                "inset -6px -4px 0 color-mix(in srgb, var(--color-neutral-500) 45%, transparent)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 22,
                left: 14,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--color-neutral-900)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 22,
                right: 14,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--color-neutral-900)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 36,
                left: "50%",
                transform: "translateX(-50%)",
                width: 16,
                height: 7,
                borderBottom: "2px solid var(--color-neutral-900)",
                borderRadius: "0 0 10px 10px",
              }}
            />
          </div>
          <div
            style={{
              position: "absolute",
              top: 52,
              left: "50%",
              transform: "translateX(-50%)",
              width: 66,
              height: 74,
              borderRadius: 24,
              background: "var(--color-accent)",
              boxShadow:
                "inset -8px -6px 0 color-mix(in srgb, var(--color-accent-800) 40%, transparent)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 56,
              left: 12,
              width: 16,
              height: 60,
              borderRadius: 9,
              background: "var(--color-accent-700)",
              transformOrigin: "50% 9px",
              animation: b.armL,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 56,
              right: 12,
              width: 16,
              height: 60,
              borderRadius: 9,
              background: "var(--color-accent-700)",
              transformOrigin: "50% 9px",
              animation: b.armR,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 122,
              left: 36,
              width: 18,
              height: 70,
              borderRadius: 9,
              background: "var(--color-neutral-800)",
              transformOrigin: "50% 4px",
              animation: b.legs,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 122,
              right: 36,
              width: 18,
              height: 70,
              borderRadius: 9,
              background: "var(--color-neutral-800)",
              transformOrigin: "50% 4px",
              animation: b.legs,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -8,
              left: "50%",
              transform: "translateX(-50%) rotateX(70deg)",
              width: 110,
              height: 26,
              borderRadius: "50%",
              background:
                "color-mix(in srgb, var(--color-neutral-900) 14%, transparent)",
            }}
          />
        </div>
      </div>
      <span className="card-meta">{b.label}</span>
    </>
  );
}
