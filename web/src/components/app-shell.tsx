"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { CameraIcon } from "./ui";
import { useGym } from "@/lib/local/provider";
import { activeDaySet, streakFrom } from "@/lib/domain/progress";
import { todayLabel } from "@/lib/domain/dates";

/**
 * The adaptive nav: a side rail on desktop, bottom tabs on phone — the user
 * chose "adaptive both". The breakpoint and both treatments come from the
 * prototype's stylesheet (see .gym-rail / .gym-tabs in globals.css).
 */

const NAV = [
  { href: "/home", label: "Home", short: "HOME" },
  { href: "/train", label: "Workouts", short: "TRAIN" },
  { href: "/diet", label: "Diet", short: "DIET" },
  { href: "/recover", label: "Recovery", short: "RECOVER" },
  { href: "/social", label: "Social", short: "SOCIAL" },
  { href: "/progress", label: "Progress", short: "PROGRESS" },
  { href: "/setup", label: "Settings", short: "SETUP" },
] as const;

function SyncBadge() {
  const { status, pending, lastError } = useGym();
  if (status === "offline") {
    return (
      <span className="tag tag-neutral" title="Changes are saved on this device">
        OFFLINE{pending ? ` · ${pending}` : ""}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="tag tag-outline"
        title={lastError ?? "Sync failed — will retry"}
      >
        SYNC RETRYING{pending ? ` · ${pending}` : ""}
      </span>
    );
  }
  if (pending > 0) {
    return <span className="tag tag-neutral">SYNCING · {pending}</span>;
  }
  return null;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { checkins, events } = useGym();

  const streak = useMemo(
    () =>
      streakFrom(
        activeDaySet(
          checkins.map((c) => c.date),
          events.map((e) => e.date),
        ),
      ),
    [checkins, events],
  );

  const isLive = pathname === "/live";
  const activeHref =
    NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
      ?.href ?? (isLive ? "/train" : "/home");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "stretch" }}>
      <nav
        className="gym-rail"
        aria-label="Main"
        style={{
          flexDirection: "column",
          gap: 4,
          width: 190,
          flex: "none",
          borderRight: "1px solid var(--color-divider)",
          padding: "18px 12px",
          position: "sticky",
          top: 0,
          height: "100vh",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 600,
            fontSize: 19,
            letterSpacing: "0.05em",
            padding: "0 10px 14px",
          }}
        >
          GYM APP
        </span>
        {NAV.map((n) => {
          const active = activeHref === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className="btn"
              style={{
                justifyContent: "flex-start",
                width: "100%",
                borderColor: "transparent",
                fontSize: 14,
                letterSpacing: "0.05em",
                padding: "8px 10px",
                background: active ? "var(--color-accent)" : "transparent",
                color: active ? "var(--color-bg)" : "inherit",
                transition: "background .15s,color .15s",
              }}
            >
              {n.label}
            </Link>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => router.push("/live")}
          className="btn btn-primary"
          style={{ width: "100%" }}
        >
          <CameraIcon /> Live workout
        </button>
        <span className="card-meta" style={{ padding: "12px 10px 0" }}>
          SHEET 02 / REV C
        </span>
      </nav>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          className="nav"
          style={{
            borderBottom: "1px solid var(--color-divider)",
            padding: "12px 18px",
          }}
        >
          <span
            className="nav-brand"
            style={{ fontSize: 16, letterSpacing: "0.05em" }}
          >
            {isLive ? "GYM APP — LIVE" : "GYM APP"}
          </span>
          <SyncBadge />
          <span className="tag tag-outline">STREAK {streak}</span>
          <span className="tag tag-neutral">{todayLabel()}</span>
        </header>

        <main
          style={{
            flex: 1,
            padding: 18,
            maxWidth: 1100,
            width: "100%",
            margin: "0 auto",
            boxSizing: "border-box",
            paddingBottom: 84,
          }}
        >
          {children}
        </main>

        <nav
          className="gym-tabs"
          aria-label="Main"
          // No `display` here — it belongs to `.gym-tabs` in globals.css, so
          // the desktop media query can turn the bar off. An inline value
          // cannot be overridden by a stylesheet and kept it on at every width.
          style={{
            borderTop: "1px solid var(--color-divider)",
            background: "var(--color-surface)",
            position: "sticky",
            bottom: 0,
          }}
        >
          {NAV.map((n) => {
            const active = activeHref === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className="gym-rowbtn"
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "11px 0",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 600,
                  fontSize: 11.5,
                  // Seven labels have to fit 360px of phone. At 0.06em they
                  // only did so in Barlow Condensed, and the webfont is not
                  // guaranteed — a blocked CDN, a privacy extension or a slow
                  // first paint all fall back to a face with wider metrics, and
                  // C33 caught RECOVER/SOCIAL/PROGRESS running together into
                  // one unreadable word. Tightened here, with condensed
                  // fallbacks added to --font-heading in industry.css.
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                  color: active
                    ? "var(--color-accent)"
                    : "color-mix(in srgb, var(--color-text) 55%, transparent)",
                  borderTop: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                }}
              >
                {n.short}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
