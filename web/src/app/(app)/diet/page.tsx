"use client";

import { useMemo } from "react";
import { Card, Kicker } from "@/components/ui";
import { useGym, useProfile, useStore } from "@/lib/local/provider";
import { dietaryLabel, groceryList, mealsForDay, REQ_NAMES } from "@/lib/domain/meals";
import { dailyTargets } from "@/lib/domain/nutrition";
import { GOALS } from "@/lib/domain/goals";
import { today } from "@/lib/domain/dates";

/**
 * Diet — targets, today's four meals, grocery list and hydration.
 *
 * Dietary requirements are hard filters, not preferences: a meal that does not
 * comply is removed from the slot entirely. Where a slot has no compliant
 * option the fallback is shown with a warning rather than silently presented
 * as safe — for a user with a nut allergy, a quietly non-compliant meal card
 * is the worst possible failure mode.
 */
export default function DietScreen() {
  const store = useStore();
  const profile = useProfile();
  const { hydration, weights, ui } = useGym();

  const todayStr = today();
  const hydroMl = hydration.find((h) => h.date === todayStr)?.ml ?? 0;
  const latestKg = weights.length ? weights[weights.length - 1].kg : null;

  const meals = useMemo(
    () => mealsForDay(profile.dietary, ui.mealIdx),
    [profile.dietary, ui.mealIdx],
  );
  const grocery = useMemo(() => groceryList(meals), [meals]);

  const targets = dailyTargets({
    goal: profile.goal,
    dietary: profile.dietary,
    heightCm: profile.height_cm,
    ageYears: profile.age,
    sex: profile.sex,
    latestKg,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        animation: "fadeUp .3s both",
      }}
    >
      {profile.dietary.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid var(--color-accent)",
            padding: "9px 14px",
            flexWrap: "wrap",
          }}
        >
          <Kicker style={{ fontSize: 10 }}>HEALTH REQUIREMENTS ACTIVE</Kicker>
          <span style={{ fontSize: 13 }}>
            {profile.dietary.map(dietaryLabel).join(" · ")} — non-compliant
            meals are removed, not deprioritised. Always verify labels.
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Card style={{ flex: "2 1 320px", padding: "16px 20px" }}>
          <Kicker style={{ fontSize: 11 }}>
            Daily targets — {GOALS[profile.goal].label}
          </Kicker>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))",
              gap: 14,
              marginTop: 6,
            }}
          >
            {[
              { value: targets.kcal, label: "kcal" },
              { value: `${targets.protein} g`, label: "protein" },
              { value: `${targets.carbs} g`, label: "carbs" },
              { value: `${targets.fat} g`, label: "fat" },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  borderLeft: "2px solid var(--color-accent)",
                  paddingLeft: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 600,
                    fontSize: 28,
                    lineHeight: 1.05,
                  }}
                >
                  {t.value}
                </span>
                <span
                  className="card-meta"
                  style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
                >
                  {t.label}
                </span>
              </div>
            ))}
          </div>
          <span className="card-meta" style={{ marginTop: 6 }}>
            {targets.note}
          </span>
        </Card>

        <Card style={{ flex: "1 1 220px", padding: 16, gap: 6 }}>
          <Kicker>HYDRATION</Kicker>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 600,
              fontSize: 28,
            }}
          >
            {(hydroMl / 1000).toFixed(2).replace(/\.?0+$/, "")} / 2.5 L
          </span>
          <div style={{ height: 6, border: "1px solid var(--color-divider)" }}>
            <div
              style={{
                height: "100%",
                background: "var(--color-accent)",
                width: `${Math.min(100, (hydroMl / 2500) * 100).toFixed(0)}%`,
                transition: "width .3s",
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => void store.addWater()}
            className="btn btn-secondary"
            style={{ marginTop: 4, fontSize: 12.5, padding: "4px 10px" }}
          >
            + 250 ml
          </button>
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(255px,1fr))",
          gap: 22,
        }}
      >
        {meals.map((meal) => (
          <Card
            key={meal.id}
            className="elev-sm"
            style={{
              gap: 8,
              padding: 16,
              animation: `fadeUp .4s ${meal.delay} both`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Kicker style={{ fontSize: 11 }}>{meal.slot}</Kicker>
              {meal.ai && <span className="tag tag-accent">ANTI-INFLAM.</span>}
            </div>
            <span className="card-title">{meal.name}</span>
            <p className="card-body" style={{ flex: "none" }}>
              {meal.desc}
            </p>

            {meal.unfiltered && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  border: "1px solid var(--color-accent)",
                  padding: "6px 8px",
                }}
                role="alert"
              >
                <strong>Does not meet your requirements.</strong> No{" "}
                {meal.slot.toLowerCase()} option satisfies all of them — treat
                this as a placeholder and substitute your own.
              </p>
            )}

            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {meal.reqTags.map((r) => (
                <span
                  key={r}
                  className="tag tag-outline"
                  style={{ fontSize: 10 }}
                >
                  {REQ_NAMES[r]}
                </span>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                borderTop:
                  "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                paddingTop: 7,
                flex: 1,
              }}
            >
              {meal.prepSteps.map((p) => (
                <span key={p.n} style={{ fontSize: 12, opacity: 0.75 }}>
                  {p.n}. {p.t}
                </span>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="tag tag-neutral">{meal.kcal} kcal</span>
                <span className="tag tag-neutral">{meal.protein} g pro</span>
              </div>
              <button
                type="button"
                onClick={() => void store.swapMeal(meal.id)}
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "3px 8px" }}
              >
                ⟳ Swap
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ padding: 16, gap: 8 }}>
        <Kicker>GROCERY LIST — TODAY&rsquo;S FOUR MEALS</Kicker>
        <div style={{ columns: 2, columnGap: 28, fontSize: 13.5 }}>
          {grocery.map((item) => (
            <div
              key={item}
              style={{
                padding: "3px 0",
                borderBottom:
                  "1px solid color-mix(in srgb, var(--color-text) 7%, transparent)",
                breakInside: "avoid",
              }}
            >
              ▢ {item}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
