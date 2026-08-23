"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CameraIcon, Kicker, toggleStyle } from "@/components/ui";
import { useGym, useProfile, useStore } from "@/lib/local/provider";
import { DAY_NAMES, today, weekKeys, weekStart } from "@/lib/domain/dates";
import { buildPlan, PREF_TIME_LABELS, todaysPlan } from "@/lib/domain/plan";
import { mealsForDay } from "@/lib/domain/meals";
import { scaleSpark } from "@/lib/domain/progress";

/**
 * Home — the day-schedule board the user picked ("Home B"): a week strip with
 * Sunday start and auto rest days, the daily check-in that feeds the streak,
 * then today's agenda with hydration, the recovery slot and dinner.
 */
export default function HomeScreen() {
  const router = useRouter();
  const store = useStore();
  const profile = useProfile();
  const { checkins, events, hydration, ui } = useGym();

  const [draft, setDraft] = useState({ sleep: 0, stress: 0, energy: 0 });

  const now = new Date();
  const dow = now.getDay();
  const todayStr = today(now);

  const days = useMemo(() => buildPlan(profile), [profile]);
  const plan = todaysPlan(profile, days, dow);
  const isTrainingDay = plan !== null;

  const meals = useMemo(
    () => mealsForDay(profile.dietary, ui.mealIdx),
    [profile.dietary, ui.mealIdx],
  );
  const dinner = meals[2];

  const ci = checkins.find((c) => c.date === todayStr);
  const last7 = checkins.slice(-7);
  const hydroMl = hydration.find((h) => h.date === todayStr)?.ml ?? 0;

  const sunday = weekStart(now);
  const activeThisWeek = useMemo(() => {
    const keys = new Set(weekKeys(now));
    const done = new Set<string>();
    for (const c of checkins) if (keys.has(c.date)) done.add(c.date);
    for (const e of events) if (keys.has(e.date)) done.add(e.date);
    return done.size;
    // `now` is a fresh Date each render; the week it falls in is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkins, events, todayStr]);

  const weekTarget = Math.max(1, profile.avail_days.length);

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
          justifyContent: "space-between",
          alignItems: "center",
          border: "1px solid var(--color-divider)",
          padding: "8px 6px",
        }}
      >
        {DAY_NAMES.map((d, i) => {
          const dt = new Date(sunday);
          dt.setDate(sunday.getDate() + i);
          const train = profile.avail_days.includes(i);
          const isToday = i === dow;
          return (
            <div key={d} style={{ flex: 1, textAlign: "center" }}>
              <div className="card-meta">{d}</div>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 600,
                  width: 26,
                  height: 26,
                  lineHeight: "26px",
                  margin: "2px auto 0",
                  background: isToday ? "var(--color-accent)" : "transparent",
                  color: isToday ? "var(--color-bg)" : "inherit",
                  opacity: train || isToday ? 1 : 0.45,
                }}
              >
                {dt.getDate()}
              </div>
              <div
                className="card-meta"
                style={{ fontSize: 9, letterSpacing: "0.06em" }}
              >
                {train ? "TRAIN" : "REST"}
              </div>
            </div>
          );
        })}
      </div>

      <DeviceStrip devices={ui.devices} />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        <Card style={{ flex: "1 1 260px", padding: 14, gap: 8 }}>
          <Kicker>DAILY CHECK-IN</Kicker>
          {ci ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="card-title" style={{ fontSize: 16 }}>
                Done for today. Sleep {ci.sleep} · Stress {ci.stress} · Energy{" "}
                {ci.energy}
              </span>
              {last7.length >= 2 && (
                <>
                  <svg
                    viewBox="0 0 120 34"
                    style={{ width: "100%", maxWidth: 220 }}
                    role="img"
                    aria-label="Energy over the last seven check-ins"
                  >
                    <polyline
                      points={scaleSpark(
                        last7.map((c) => c.energy),
                        120,
                        34,
                      )}
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth="1.5"
                    />
                  </svg>
                  <span className="card-meta">Energy — last 7 check-ins</span>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(
                [
                  ["sleep", "Sleep"],
                  ["stress", "Stress"],
                  ["energy", "Energy"],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span
                    className="text-muted"
                    style={{ fontSize: 12.5, width: 52, flex: "none" }}
                    id={`ci-${key}`}
                  >
                    {label}
                  </span>
                  <div
                    style={{ display: "flex", gap: 5 }}
                    role="group"
                    aria-labelledby={`ci-${key}`}
                  >
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={draft[key] === v}
                        onClick={() => setDraft((d) => ({ ...d, [key]: v }))}
                        className="btn"
                        style={{
                          width: 30,
                          height: 30,
                          padding: 0,
                          fontSize: 13,
                          ...toggleStyle(draft[key] === v),
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  void store.saveCheckin({
                    sleep: draft.sleep || 3,
                    stress: draft.stress || 3,
                    energy: draft.energy || 3,
                  })
                }
                className="btn btn-primary"
                style={{ marginTop: 2 }}
              >
                Log it — keeps the streak
              </button>
            </div>
          )}
        </Card>

        <Card
          className="elev-sm"
          style={{
            flex: "2 1 320px",
            padding: 0,
            gap: 0,
            overflow: "visible",
          }}
        >
          {isTrainingDay ? (
            <div
              style={{
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                borderBottom: "1px solid var(--color-divider)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Kicker>
                  TODAY {PREF_TIME_LABELS[profile.pref_time]} — SCHEDULED
                </Kicker>
                <span className="tag tag-accent">
                  {profile.session_len} MIN
                </span>
              </div>
              <span className="card-title" style={{ fontSize: 19 }}>
                {plan.focus} ·{" "}
                {profile.kit === "dbbw" ? "dumbbells" : "bodyweight"}
              </span>
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <Link
                  href="/train"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  Start session
                </Link>
                <button
                  type="button"
                  onClick={() => router.push("/live")}
                  className="btn btn-secondary"
                >
                  <CameraIcon /> Live
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                borderBottom: "1px solid var(--color-divider)",
              }}
            >
              <Kicker>TODAY — RECOVERY DAY (SCHEDULED)</Kicker>
              <span className="card-title" style={{ fontSize: 19 }}>
                Recovery walk — 25 min brisk
              </span>
              <p className="card-body" style={{ margin: 0 }}>
                Rest is training too. Walk, breathe, stretch — no barbell
                heroics today.
              </p>
              <Link
                href="/recover"
                className="btn btn-secondary"
                style={{ marginTop: 2 }}
              >
                Open recovery tools
              </Link>
            </div>
          )}

          <div
            style={{
              padding: "11px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--color-divider)",
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Hydration · {formatHydration(hydroMl)}
            </span>
            <button
              type="button"
              onClick={() => void store.addWater()}
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "2px 8px" }}
            >
              + 250 ml
            </button>
          </div>

          <Link
            href="/recover"
            className="gym-rowbtn"
            style={{
              padding: "11px 16px",
              display: "flex",
              justifyContent: "space-between",
              width: "100%",
              borderBottom: "1px solid var(--color-divider)",
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              18:00 · Lymphatic drainage — 12 min
            </span>
            <span className="tag tag-neutral">RECOVERY</span>
          </Link>

          <Link
            href="/diet"
            className="gym-rowbtn"
            style={{
              padding: "11px 16px",
              display: "flex",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Dinner · {dinner.name}
            </span>
            <span className="tag tag-accent">
              {dinner.ai ? "ANTI-INFLAM." : `${dinner.kcal} KCAL`}
            </span>
          </Link>
        </Card>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <QuickTile
          href="/recover"
          title="10-min desk reset"
          sub="Busy-day stretch · no kit"
        />
        <QuickTile
          href="/recover?breathe=1"
          title="Breathing timer"
          sub="Box breathing · 5 min calm"
        />
        <QuickTile
          href="/progress"
          title={`${activeThisWeek} of ${weekTarget} this week`}
          sub="Open progress"
        />
      </div>
    </div>
  );
}

function QuickTile({
  href,
  title,
  sub,
}: {
  href: string;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="btn btn-secondary"
      style={{
        flex: "1 1 180px",
        flexDirection: "column",
        gap: 2,
        padding: 10,
      }}
    >
      <span style={{ fontSize: 14 }}>{title}</span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontWeight: 400,
          fontSize: 11,
          opacity: 0.65,
        }}
      >
        {sub}
      </span>
    </Link>
  );
}

/**
 * The synced-stats strip. These readings are simulated — Health Connect and
 * HealthKit need the native wrapper (M4) — and the strip says so rather than
 * presenting invented numbers as measurements.
 */
function DeviceStrip({ devices }: { devices: Record<string, boolean> }) {
  const count = Object.values(devices).filter(Boolean).length;
  if (!count) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        border: "1px solid var(--color-divider)",
        padding: "9px 14px",
        flexWrap: "wrap",
      }}
    >
      <Kicker style={{ fontSize: 10 }}>SYNCED</Kicker>
      <span style={{ fontSize: 13 }}>
        <strong style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>
          6,842
        </strong>{" "}
        steps
      </span>
      <span style={{ fontSize: 13 }}>
        <strong style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>
          61
        </strong>{" "}
        resting HR
      </span>
      <span style={{ fontSize: 13 }}>
        <strong style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>
          7 h 20 m
        </strong>{" "}
        sleep
      </span>
      <span className="card-meta" style={{ marginLeft: "auto" }}>
        {count} device(s) · simulated
      </span>
    </div>
  );
}

function formatHydration(ml: number): string {
  return `${(ml / 1000).toFixed(2).replace(/\.?0+$/, "")} / 2.5 L`;
}
