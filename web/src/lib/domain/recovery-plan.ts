import { DAY_NAMES } from "./dates";
import {
  RECOVERY_LIBRARY,
  STRETCHES,
  holdSeconds,
  isPerSide,
  resolveStep,
  type RoutineStep,
  type ResolvedMove,
  type RecoveryKind,
} from "./recovery";
import type { Declarations } from "./conditions";
import type { Level, SessionLen } from "@/lib/types/database";

/**
 * The recovery-session generator — M7 / C30.
 *
 * `buildPlan` has always taken a profile and produced a week. Recovery showed
 * everyone the same three routines and described the schedule in a closing
 * sentence: "Recovery days are scheduled around your 3 training day(s)". They
 * were not scheduled around anything; the sentence was the whole feature.
 *
 * This is the same kind of function as `buildPlan`: pure, profile-driven,
 * filtered. Three things drive it.
 *
 * **Placement.** Recovery days are the days not in `avail_days`. That is the
 * sentence made real.
 *
 * **Scale.** `session_len` and `level` set how many movements a session holds.
 * Doses are not scaled — a 45-second doorway stretch is 45 seconds whether you
 * have ten minutes or an hour, and stretching the same movement to fit a number
 * would be arithmetic pretending to be programming. Length changes the count.
 *
 * **Declarations.** The C27 filter runs over generated output exactly as it ran
 * over the fixed routines, and every substitution it makes is reported on the
 * day that carries it.
 *
 * The three hand-written routines are kept as session *templates* rather than
 * discarded. They are user-approved content from the prototype, they are the
 * only place the sequencing was thought about, and a generator that threw them
 * away to prove it could would be worse at the job. A template short of budget
 * is topped up from the library; a template over budget is trimmed from the
 * end, where the sequences put their optional work.
 *
 * **This chunk collides with C21** — noted in ECC-PLAN.md's concurrency map.
 * Both read the same declarations. `reasons` exists so C21's per-rule strings
 * have somewhere to land without reshaping anything; today it carries what C30
 * itself decided.
 */

export interface RecoverySettings extends Pick<Declarations, "bone_health"> {
  session_len: SessionLen;
  level: Level;
  avail_days: number[];
  pelvic_floor: Declarations["pelvic_floor"];
}

export interface RecoveryDay {
  label: string;
  /** The template this session was built from. */
  routine: string;
  focus: string;
  moves: ResolvedMove[];
  /** Rough, and labelled rough wherever it is shown. */
  minutes: number;
  tip: string;
  /** Why this session looks like this. C21's rule strings land here too. */
  reasons: string[];
  delay: string;
}

/** Movements per session, before the level adjustment. */
const BUDGET: Record<number, number> = { 10: 3, 20: 4, 30: 5, 45: 6, 60: 7 };

/**
 * More than four recovery cards is a wall of text nobody reads, and someone
 * who trains one day a week does not need six distinct sessions laid out.
 */
const MAX_DAYS = 4;

/** Seconds assumed for a rep-based movement, for the minutes estimate only. */
const REP_SECONDS = 45;

const TIPS = [
  "Recovery is not the reward for training — it is part of it.",
  "Ease to the first point of tension, not past it. That edge moves on its own.",
  "If you are holding your breath, the stretch is too aggressive.",
  "Little and often beats one long session you dread.",
];

export function moveBudget(session_len: SessionLen, level: Level): number {
  const base = BUDGET[session_len] ?? 4;
  const adjusted =
    base + (level === "beginner" ? -1 : level === "advanced" ? 1 : 0);
  return Math.max(2, adjusted);
}

/**
 * The days recovery is scheduled on: whatever training is not using.
 *
 * Someone who trains every day still gets a session — doubled up on their first
 * training day, and told so — because "you train too much for recovery" is not
 * a thing this app should say.
 */
export function recoveryDays(avail_days: number[]): number[] {
  const free = [0, 1, 2, 3, 4, 5, 6].filter((d) => !avail_days.includes(d));
  if (!free.length) return [avail_days[0] ?? 0];
  return free.slice(0, MAX_DAYS);
}

/** A rough total, from the doses. Shown with a "≈" and never as a promise. */
export function estimateMinutes(moves: ResolvedMove[]): number {
  const seconds = moves.reduce((total, m) => {
    const hold = holdSeconds(m.dose) ?? REP_SECONDS;
    return total + (isPerSide(m.dose) ? hold * 2 : hold);
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}

function declaresPelvicFloor(s: RecoverySettings): boolean {
  return s.pelvic_floor === "occasional" || s.pelvic_floor === "diagnosed";
}

/**
 * Which kinds to top a short template up with, in preference order.
 *
 * Ordered rather than filtered: nothing in the recovery library is unsafe for a
 * pelvic floor, because the impact and heavy-Valsalva rule that C21 owns has no
 * impact work here to bite on. Ordering is the honest strength of claim.
 */
function fillOrder(s: RecoverySettings): RecoveryKind[] {
  if (declaresPelvicFloor(s)) {
    return ["breath", "mobility", "stretch", "restore", "drainage"];
  }
  return ["mobility", "stretch", "breath", "restore", "drainage"];
}

/**
 * The pool for one kind, rotated by day and then ordered by preference.
 *
 * The rotation stops two sessions built from the same template filling with the
 * same movements. It has to happen *before* the preference sort, not after: a
 * rotation applied on top would step straight past the preference on some days,
 * which is how the first version of this handed `Box breathing` to a declared
 * pelvic floor. Its four-second holds are the one thing in that group raising
 * intra-abdominal pressure — the mechanism the declaration is about — so braced
 * movements sort last and rotation only varies the order within each tier.
 */
function fillPool(kind: RecoveryKind, s: RecoverySettings, di: number) {
  const all = RECOVERY_LIBRARY.filter((m) => m.kind === kind);
  const at = (di * 2) % Math.max(1, all.length);
  const pool = [...all.slice(at), ...all.slice(0, at)];
  if (!declaresPelvicFloor(s)) return pool;
  const braced = (m: (typeof pool)[number]) =>
    (m.contra ?? []).includes("valsalva");
  return [...pool.filter((m) => !braced(m)), ...pool.filter(braced)];
}

/**
 * The steps of a template that fit the budget, in the template's own order.
 *
 * Trimming from the end is the obvious implementation and the wrong one: it
 * took "Legs up the wall" — the entire reason Evening unwind is restful — out of
 * every session under six movements. Steps marked `keep` are taken first, then
 * the rest in order, then the whole selection is put back into template order so
 * the sequencing survives. A closer stays a closer.
 */
export function pickSteps(steps: RoutineStep[], budget: number): RoutineStep[] {
  if (steps.length <= budget) return steps;
  const idx = new Map(steps.map((step, i) => [step, i]));
  const kept = steps.filter((step) => step.keep).slice(0, budget);
  const filler = steps
    .filter((step) => !step.keep)
    .slice(0, Math.max(0, budget - kept.length));
  return [...kept, ...filler].sort((a, b) => idx.get(a)! - idx.get(b)!);
}

export function buildRecovery(s: RecoverySettings): RecoveryDay[] {
  const days = recoveryDays(s.avail_days);
  const budget = moveBudget(s.session_len, s.level);
  const trainsEveryDay = s.avail_days.length === 7;
  const order = fillOrder(s);

  return days.map((dow, di) => {
    const template = STRETCHES[di % STRETCHES.length];
    const used = new Set<string>();
    const moves: ResolvedMove[] = [];

    for (const step of pickSteps(template.steps, budget)) {
      const resolved = resolveStep(step, s);
      if (used.has(resolved.n)) continue;
      used.add(resolved.n);
      moves.push(resolved);
    }

    // Top up from the library when the session has room for more than the
    // template holds. Offset by day so two sessions built from the same
    // template do not fill with the same movements.
    for (const kind of order) {
      if (moves.length >= budget) break;
      for (const candidate of fillPool(kind, s, di)) {
        if (moves.length >= budget) break;
        const resolved = resolveStep({ move: candidate.n }, s);
        if (used.has(resolved.n)) continue;
        used.add(resolved.n);
        moves.push(resolved);
      }
    }

    const swapped = moves.filter((m) => m.swappedFrom);
    const reasons: string[] = [];
    if (trainsEveryDay) {
      reasons.push(
        "You train every day, so this sits alongside a session rather than replacing one.",
      );
    }
    if (moves.length !== template.steps.length) {
      // Deliberately says *training* sessions. Recovery is scaled by how long
      // you train, not held to the same length — a card reading "≈8 min" beside
      // a reason claiming a 60-minute session contradicts itself.
      reasons.push(
        `${moves.length} movements, scaled to your ${s.session_len}-minute training sessions.`,
      );
    }
    // Grouped by explanation: a session can swap for flexion and for rotation
    // at once, and one line naming three swaps under a single mechanism would
    // be wrong about two of them.
    for (const why of [...new Set(swapped.map((m) => m.reason ?? ""))]) {
      const names = swapped
        .filter((m) => (m.reason ?? "") === why)
        .map((m) => `${m.swappedFrom} → ${m.n}`)
        .join(", ");
      reasons.push(`Swapped: ${names}. ${why}`.trim());
    }
    if (order[0] === "breath") {
      reasons.push(
        "Breath work leads — you told us about pelvic floor symptoms.",
      );
    }

    const kinds = [...new Set(moves.map((m) => m.kind))];
    return {
      label: `${DAY_NAMES[dow] ?? "ANY DAY"} — RECOVERY`,
      routine: template.n,
      focus: kinds.map((k) => k[0].toUpperCase() + k.slice(1)).join(" · "),
      moves,
      minutes: estimateMinutes(moves),
      tip: TIPS[di % TIPS.length],
      reasons: reasons.filter(Boolean),
      delay: `${(di * 0.07).toFixed(2)}s`,
    };
  });
}

/**
 * A guided run through one session, movement by movement.
 *
 * The detail page at `/recover/[slug]` already has the cues, the safety note,
 * the variations and the timer. Following a session is that page in sequence,
 * so C32 threads position through the URL rather than building a second screen
 * that would have to keep all of it in step.
 *
 * Position is `day` and `i`. Both are checked against the freshly generated week
 * on arrival: a link shared or bookmarked before a declaration changed can name
 * a movement that is no longer at that index, and the page falls back to
 * standalone rather than showing someone a session they are not in.
 */
export function sessionHref(
  day: number,
  i: number,
  move: { n: string; dose: string },
  slugOf: (name: string) => string,
): string {
  const q = new URLSearchParams({
    dose: move.dose,
    day: String(day),
    i: String(i),
  });
  return `/recover/${slugOf(move.n)}?${q}`;
}

export interface SessionPosition {
  day: RecoveryDay;
  dayIndex: number;
  index: number;
  move: ResolvedMove;
  next: ResolvedMove | null;
  isLast: boolean;
}

/** Resolve a `?day=&i=` pair against this profile's week, or null if stale. */
export function locateInSession(
  days: RecoveryDay[],
  dayParam: string | undefined,
  iParam: string | undefined,
  slug: string,
  slugOf: (name: string) => string,
): SessionPosition | null {
  if (dayParam === undefined || iParam === undefined) return null;
  const dayIndex = Number(dayParam);
  const index = Number(iParam);
  if (!Number.isInteger(dayIndex) || !Number.isInteger(index)) return null;
  const day = days[dayIndex];
  const move = day?.moves[index];
  // The URL names a movement; if the generated week no longer agrees, the
  // position is stale and following it would be worse than ignoring it.
  if (!day || !move || slugOf(move.n) !== slug) return null;
  return {
    day,
    dayIndex,
    index,
    move,
    next: day.moves[index + 1] ?? null,
    isLast: index === day.moves.length - 1,
  };
}

/** Which generated day is scheduled for `dow`, or null. Mirrors `todaysPlan`. */
export function todaysRecovery(
  days: RecoveryDay[],
  avail_days: number[],
  dow: number,
): RecoveryDay | null {
  const scheduled = recoveryDays(avail_days);
  const idx = scheduled.indexOf(dow);
  return idx === -1 ? null : (days[idx] ?? null);
}
