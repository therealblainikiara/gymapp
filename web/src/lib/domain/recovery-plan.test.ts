import { describe, expect, it } from "vitest";
import {
  buildRecovery,
  estimateMinutes,
  locateInSession,
  pickSteps,
  sessionHref,
  moveBudget,
  recoveryDays,
  todaysRecovery,
  type RecoverySettings,
} from "./recovery-plan";
import { STRETCHES } from "./recovery";
import { removedMovementFlags } from "./conditions";
import type { Level, SessionLen } from "@/lib/types/database";

const base: RecoverySettings = {
  session_len: 30,
  level: "intermediate",
  avail_days: [1, 3, 5],
  bone_health: null,
  pelvic_floor: null,
};

const LENGTHS: SessionLen[] = [10, 20, 30, 45, 60];
const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

function movesIn(s: RecoverySettings) {
  return buildRecovery(s).flatMap((d) => d.moves);
}

describe("placement", () => {
  it("puts recovery on the days training leaves free", () => {
    // Mon/Wed/Fri training → Sun, Tue, Thu, Sat free, capped at four.
    expect(recoveryDays([1, 3, 5])).toEqual([0, 2, 4, 6]);
    expect(recoveryDays([0, 1, 2, 3, 4])).toEqual([5, 6]);
  });

  it("caps the week at four sessions", () => {
    // Six recovery cards is a wall of text nobody reads.
    expect(recoveryDays([1])).toHaveLength(4);
    expect(recoveryDays([])).toHaveLength(4);
  });

  it("still gives a session to someone who trains every day", () => {
    // "You train too much for recovery" is not a thing this app should say.
    const days = buildRecovery({ ...base, avail_days: [0, 1, 2, 3, 4, 5, 6] });
    expect(days).toHaveLength(1);
    expect(days[0].reasons.join(" ")).toContain("train every day");
  });

  it("labels each session with its day", () => {
    for (const d of buildRecovery(base)) {
      expect(d.label).toMatch(/— RECOVERY$/);
    }
  });

  it("finds today's session, and nothing on a training day", () => {
    const days = buildRecovery(base);
    expect(todaysRecovery(days, base.avail_days, 0)).toBe(days[0]);
    expect(todaysRecovery(days, base.avail_days, 2)).toBe(days[1]);
    for (const dow of base.avail_days) {
      expect(todaysRecovery(days, base.avail_days, dow)).toBeNull();
    }
  });
});

describe("scale", () => {
  it("gives a longer session more movements", () => {
    // The C30 accept criterion: two profiles differing only in session_len get
    // different routines.
    const counts = LENGTHS.map(
      (session_len) => buildRecovery({ ...base, session_len })[0].moves.length,
    );
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[0]).toBeLessThan(counts[counts.length - 1]);
  });

  it("adjusts by level and never drops below two", () => {
    expect(moveBudget(30, "beginner")).toBe(4);
    expect(moveBudget(30, "intermediate")).toBe(5);
    expect(moveBudget(30, "advanced")).toBe(6);
    expect(moveBudget(10, "beginner")).toBe(2);
  });

  it("hits the budget exactly, for every length and level", () => {
    for (const session_len of LENGTHS) {
      for (const level of LEVELS) {
        const budget = moveBudget(session_len, level);
        for (const d of buildRecovery({ ...base, session_len, level })) {
          expect(
            d.moves.length,
            `${session_len}min ${level}: ${d.routine}`,
          ).toBe(budget);
        }
      }
    }
  });

  it("never prescribes the same movement twice in one session", () => {
    for (const session_len of LENGTHS) {
      for (const level of LEVELS) {
        for (const bone_health of [null, "osteoporosis"] as const) {
          for (const d of buildRecovery({
            ...base,
            session_len,
            level,
            bone_health,
          })) {
            const names = d.moves.map((m) => m.n);
            expect(new Set(names).size, `${d.routine}: ${names}`).toBe(
              names.length,
            );
          }
        }
      }
    }
  });

  it("does not scale doses", () => {
    // A 45-second doorway stretch is 45 seconds whether you have ten minutes or
    // an hour. Stretching a dose to fit a number would be arithmetic pretending
    // to be programming.
    const short = movesIn({ ...base, session_len: 10 });
    const long = movesIn({ ...base, session_len: 60 });
    for (const m of short) {
      const same = long.find((x) => x.n === m.n);
      if (same) expect(same.dose).toBe(m.dose);
    }
  });
});

describe("the estimate", () => {
  it("counts a per-side hold twice", () => {
    expect(
      estimateMinutes([
        { dose: "60 s / side" },
        { dose: "60 s" },
      ] as Parameters<typeof estimateMinutes>[0]),
    ).toBe(3);
  });

  it("is plausible for every generated session", () => {
    for (const session_len of LENGTHS) {
      for (const d of buildRecovery({ ...base, session_len })) {
        expect(d.minutes, `${d.routine}`).toBeGreaterThan(0);
        expect(d.minutes, `${d.routine}`).toBeLessThanOrEqual(30);
      }
    }
  });
});

describe("the C27 filter still holds over generated output", () => {
  // The other half of the C30 accept criterion. Generation is the point where a
  // filter proven over fixed content quietly stops covering everything.
  it("never prescribes a contraindicated movement, at any length or level", () => {
    const banned = removedMovementFlags({ bone_health: "osteoporosis" });
    expect(banned.length).toBeGreaterThan(0);
    for (const session_len of LENGTHS) {
      for (const level of LEVELS) {
        for (const avail_days of [[1, 3, 5], [1], [], [0, 1, 2, 3, 4, 5, 6]]) {
          for (const pelvic_floor of [null, "diagnosed"] as const) {
            const moves = movesIn({
              ...base,
              session_len,
              level,
              avail_days,
              pelvic_floor,
              bone_health: "osteoporosis",
            });
            expect(moves.length).toBeGreaterThan(0);
            for (const m of moves) {
              for (const f of m.contra ?? []) {
                expect(
                  banned,
                  `${m.n} prescribed despite ${f} (${session_len}min ${level})`,
                ).not.toContain(f);
              }
            }
          }
        }
      }
    }
  });

  it("is not a vacuous sweep — those movements are prescribed otherwise", () => {
    const banned = removedMovementFlags({ bone_health: "osteoporosis" });
    const removable = movesIn({ ...base, session_len: 60 }).filter((m) =>
      (m.contra ?? []).some((f) => banned.includes(f)),
    );
    expect(removable.length).toBeGreaterThan(0);
  });

  it("explains every substitution on the day that carries it", () => {
    const days = buildRecovery({ ...base, bone_health: "osteoporosis" });
    let sawOne = false;
    for (const d of days) {
      if (!d.moves.some((m) => m.swappedFrom)) continue;
      sawOne = true;
      const why = d.reasons.join(" ");
      expect(why, `${d.routine} swapped silently`).toContain("osteoporosis");
      // Names both halves, so the user can tell what went and what arrived.
      for (const m of d.moves.filter((x) => x.swappedFrom)) {
        expect(why).toContain(m.swappedFrom!);
        expect(why).toContain(m.n);
      }
      // The movement is in the plan — its replacement is on the same card.
      expect(why, `${d.routine} claims a movement is absent`).not.toContain(
        "Not in your plan",
      );
    }
    expect(sawOne).toBe(true);
  });

  it("never contradicts itself about how long a session is", () => {
    // The estimate is minutes of stretching; session_len is how long the user
    // trains. A card reading "≈8 min" beside "for a 60-minute session" is two
    // numbers arguing on the same card.
    for (const session_len of LENGTHS) {
      for (const d of buildRecovery({ ...base, session_len })) {
        for (const r of d.reasons) {
          if (r.includes(`${session_len}-minute`)) {
            expect(r, r).toContain("training sessions");
          }
        }
      }
    }
  });
});

describe("declarations shape the fill order", () => {
  it("leads with breath work when pelvic floor symptoms are declared", () => {
    for (const pelvic_floor of ["occasional", "diagnosed"] as const) {
      const days = buildRecovery({ ...base, session_len: 60, pelvic_floor });
      expect(days[0].reasons.join(" ")).toContain("pelvic floor");
    }
  });

  it("removes nothing for pelvic floor — ordering is the honest claim", () => {
    // Nothing in the recovery library is unsafe for a pelvic floor; the impact
    // and heavy-Valsalva rule C21 owns has nothing here to bite on. Silently
    // dropping movements would overstate what is known.
    const withOut = movesIn({ ...base, session_len: 60 }).length;
    const withIt = movesIn({
      ...base,
      session_len: 60,
      pelvic_floor: "diagnosed",
    }).length;
    expect(withIt).toBe(withOut);
  });

  it("does not hand over the braced breath drill first", () => {
    // Leading with breath work and then offering Box breathing — whose holds
    // are the one thing in that group raising intra-abdominal pressure — would
    // be backwards.
    for (const d of buildRecovery({
      ...base,
      session_len: 60,
      pelvic_floor: "diagnosed",
    })) {
      const breaths = d.moves.filter((m) => m.kind === "breath");
      if (breaths.length > 1) {
        expect(breaths[0].contra ?? [], `${d.routine}`).not.toContain(
          "valsalva",
        );
      }
    }
  });

  it("gives each swap the explanation that actually applies to it", () => {
    // A session can swap for flexion and for rotation at once. One line naming
    // three swaps under a single mechanism is wrong about two of them.
    for (const d of buildRecovery({
      ...base,
      session_len: 60,
      bone_health: "osteoporosis",
    })) {
      for (const m of d.moves.filter((x) => x.swappedFrom)) {
        const line = d.reasons.find((r) => r.includes(m.swappedFrom!));
        expect(line, `${m.swappedFrom} has no line`).toBeTruthy();
        expect(line, `${m.swappedFrom} got the wrong mechanism`).toContain(
          m.reason!,
        );
      }
    }
  });
});

describe("the templates are used, not discarded", () => {
  it("builds each session from a hand-written routine", () => {
    const names = STRETCHES.map((r) => r.n);
    for (const d of buildRecovery(base)) {
      expect(names, `${d.routine} is not a template`).toContain(d.routine);
    }
  });

  it("keeps the template's own movements when the budget allows", () => {
    const day = buildRecovery({ ...base, session_len: 45 })[0];
    const template = STRETCHES[0].steps.map((s) => s.move);
    // Every template movement survives, in order, before any top-up.
    expect(day.moves.slice(0, template.length).map((m) => m.n)).toEqual(
      template,
    );
  });

  it("varies the fill between two sessions built from the same template", () => {
    // Four recovery days over three templates means one repeats; two identical
    // cards would read as a bug.
    const days = buildRecovery({ ...base, session_len: 60, avail_days: [] });
    const first = days[0].moves.map((m) => m.n).join();
    const repeat = days.find((d, i) => i > 0 && d.routine === days[0].routine);
    if (repeat) expect(repeat.moves.map((m) => m.n).join()).not.toBe(first);
  });
});

describe("C32 — trimming keeps what the routine is for", () => {
  it("keeps the closer when the session is short", () => {
    // Trimming from the end took "Legs up the wall" — the entire reason Evening
    // unwind is restful — out of every session under six movements.
    const evening = STRETCHES[2];
    for (let budget = 2; budget <= evening.steps.length; budget++) {
      const picked = pickSteps(evening.steps, budget).map((x) => x.move);
      expect(picked, `budget ${budget}`).toContain("Legs up the wall");
      expect(picked).toHaveLength(Math.min(budget, evening.steps.length));
    }
  });

  it("keeps every marked step in every template, at every budget", () => {
    for (const r of STRETCHES) {
      const keepers = r.steps.filter((x) => x.keep).map((x) => x.move);
      expect(keepers.length, `${r.n} marks nothing`).toBeGreaterThan(0);
      for (let budget = keepers.length; budget <= r.steps.length; budget++) {
        const picked = pickSteps(r.steps, budget).map((x) => x.move);
        for (const k of keepers) {
          expect(picked, `${r.n} at ${budget} dropped ${k}`).toContain(k);
        }
      }
    }
  });

  it("puts the selection back in the template's order", () => {
    // A closer that survives the trim but arrives second is not a closer.
    for (const r of STRETCHES) {
      for (let budget = 2; budget <= r.steps.length; budget++) {
        const order = r.steps.map((x) => x.move);
        const picked = pickSteps(r.steps, budget).map((x) => x.move);
        const positions = picked.map((m) => order.indexOf(m));
        expect(positions, `${r.n} at ${budget}`).toEqual(
          [...positions].sort((a, b) => a - b),
        );
      }
    }
  });

  it("returns the template untouched when it fits", () => {
    for (const r of STRETCHES) {
      expect(pickSteps(r.steps, r.steps.length)).toBe(r.steps);
      expect(pickSteps(r.steps, 99)).toBe(r.steps);
    }
  });
});

describe("C32 — following a session movement by movement", () => {
  const days = buildRecovery(base);
  const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  it("locates a position and knows what comes next", () => {
    const first = days[0].moves[0];
    const at = locateInSession(days, "0", "0", slug(first.n), slug);
    expect(at?.move.n).toBe(first.n);
    expect(at?.next?.n).toBe(days[0].moves[1].n);
    expect(at?.isLast).toBe(false);
  });

  it("knows when it has reached the end", () => {
    const last = days[0].moves.length - 1;
    const at = locateInSession(
      days,
      "0",
      String(last),
      slug(days[0].moves[last].n),
      slug,
    );
    expect(at?.isLast).toBe(true);
    expect(at?.next).toBeNull();
  });

  it("ignores a stale position rather than following it", () => {
    // A link shared or bookmarked before a declaration changed can name a
    // movement no longer at that index. Showing someone a session they are not
    // in is worse than showing them the movement on its own.
    const s0 = slug(days[0].moves[0].n);
    expect(locateInSession(days, "0", "0", "some-other-movement", slug)).toBeNull();
    expect(locateInSession(days, "99", "0", s0, slug)).toBeNull();
    expect(locateInSession(days, "0", "99", s0, slug)).toBeNull();
    expect(locateInSession(days, "abc", "0", s0, slug)).toBeNull();
    expect(locateInSession(days, undefined, undefined, s0, slug)).toBeNull();
  });

  it("builds a href that round-trips back to the same position", () => {
    for (let i = 0; i < days[0].moves.length; i++) {
      const m = days[0].moves[i];
      const url = new URL(sessionHref(0, i, m, slug), "https://example.test");
      const at = locateInSession(
        days,
        url.searchParams.get("day") ?? undefined,
        url.searchParams.get("i") ?? undefined,
        url.pathname.split("/").pop()!,
        slug,
      );
      expect(at?.move.n, url.href).toBe(m.n);
      expect(url.searchParams.get("dose")).toBe(m.dose);
    }
  });

  it("walks the whole session from the first movement to the last", () => {
    // The C32 accept criterion: a stretch session can be followed movement by
    // movement without passing through a workout.
    let at = locateInSession(days, "0", "0", slug(days[0].moves[0].n), slug);
    const walked: string[] = [];
    let guard = 0;
    while (at && guard++ < 20) {
      walked.push(at.move.n);
      if (at.isLast) break;
      const url = new URL(
        sessionHref(0, at.index + 1, at.next!, slug),
        "https://example.test",
      );
      at = locateInSession(
        days,
        url.searchParams.get("day") ?? undefined,
        url.searchParams.get("i") ?? undefined,
        url.pathname.split("/").pop()!,
        slug,
      );
    }
    expect(walked).toEqual(days[0].moves.map((m) => m.n));
    expect(at?.isLast).toBe(true);
  });
});
