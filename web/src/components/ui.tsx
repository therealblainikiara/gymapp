import type { CSSProperties, ReactNode } from "react";

/**
 * Shared pieces of the Industry system. The readme is emphatic that a framed
 * element never loses its registration marks, so every card goes through
 * <Blueprint> rather than hand-writing four <i> tags each time.
 */

export function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  );
}

export function Blueprint({
  as: Tag = "div",
  className = "",
  style,
  children,
}: {
  as?: "div" | "figure" | "section";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Tag className={`blueprint ${className}`.trim()} style={style}>
      <Corners />
      {children}
    </Tag>
  );
}

/** A card that is also a blueprint object — the most common combination. */
export function Card({
  className = "",
  style,
  role,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  /** For the rare card that is an announcement rather than content. */
  role?: string;
  children: ReactNode;
}) {
  return (
    <div className={`card blueprint ${className}`.trim()} style={style} role={role}>
      <Corners />
      {children}
    </div>
  );
}

export function Kicker({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span className="card-kicker" style={style}>
      {children}
    </span>
  );
}

/** Lucide `camera`, at the system's 1.5 stroke. */
export function CameraIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

/**
 * Selection state as the prototype expressed it: an accent fill when on, a
 * hairline outline when off.
 */
export const ON = {
  background: "var(--color-accent)",
  color: "var(--color-bg)",
  borderColor: "var(--color-accent)",
} as const;

export const OFF = {
  background: "transparent",
  color: "inherit",
  borderColor: "var(--color-divider)",
} as const;

export function toggleStyle(active: boolean): CSSProperties {
  return active ? { ...ON } : { ...OFF };
}
