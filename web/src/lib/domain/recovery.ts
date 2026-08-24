import type { MovementFlag } from "./exercises";
import { movementSwapReason, removedMovementFlags } from "./conditions";
import type { Declarations } from "./conditions";
import { findRecoveryMove, type RecoveryMove } from "./recovery-library";

export type {
  RecoveryKind,
  RecoveryMove,
} from "./recovery-library";
export {
  findRecoveryMove,
  RECOVERY_LIBRARY,
  RECOVERY_BY_NAME,
} from "./recovery-library";

/**
 * Recovery routines, and the filter that keeps them honest.
 *
 * M7 / C27 established the filter: C20 shipped a tested guarantee that no
 * *workout* reaches a user with declared osteoporosis containing loaded spinal
 * flexion or end-range rotation, while this screen was serving that same user
 * Child's pose, a supine twist and a standing hamstring reach. A filter that
 * covers one screen and not its neighbour is worse than no filter, because it
 * manufactures trust the product has not earned.
 *
 * M7 / C28 moved the movements themselves into `recovery-library.ts`, so a
 * routine is now a sequence of *references* plus the dose it wants. Two things
 * follow from that, and both were the point:
 *
 *   - The same movement can appear at two doses without being two movements.
 *     `Quadruped rock-back` is "× 8" in the morning flow and a "90 s" hold in
 *     the evening; before C28 those were separate entries with separately
 *     drifting copy.
 *   - A swapped-in movement is as documented as the one it replaced. C27
 *     attached replacements as nested literals with a cue and a note and
 *     nothing else, which meant the users who most need the information got the
 *     least of it.
 *
 * **Recovery swaps rather than drops.** `buildPlan` picks from a pool, so
 * removing an exercise means taking the next one. A stretch routine is a
 * curated sequence with a stated duration — dropping a step leaves a three-move
 * "8 min" routine that no longer takes 8 minutes.
 */

/**
 * One line of a routine: which movement, and — only when it differs from the
 * movement's own dose — how much of it.
 *
 * An explicit dose is a statement that *this duration is the point*, and it is
 * what carries onto a replacement when a declaration forces a swap. Without one
 * the replacement uses its own dose, which is almost always what you want:
 * `Standing hamstring reach × 8` swapping to `Supine hamstring stretch` should
 * become "30 s / side", not "× 8". Before C30 the step's dose was carried
 * unconditionally, so someone with declared osteoporosis opening Evening unwind
 * was told to do "90/90 breathing — 60 s / side", a breath drill with a side.
 */
export interface RoutineStep {
  move: string;
  dose?: string;
}

export interface StretchRoutine {
  n: string;
  min: number;
  steps: RoutineStep[];
}

export const STRETCHES: StretchRoutine[] = [
  {
    n: "Morning mobility flow",
    min: 8,
    steps: [
      { move: "Cat–cow" },
      { move: "Hip circles" },
      { move: "World's greatest stretch" },
      { move: "Standing hamstring reach" },
    ],
  },
  {
    n: "Desk reset — express",
    min: 10,
    steps: [
      { move: "Chin tuck" },
      { move: "Doorway chest stretch" },
      { move: "Thoracic rotation" },
      { move: "Wrist and finger opener" },
    ],
  },
  {
    n: "Evening unwind",
    min: 12,
    steps: [
      // The 90 s is spelled out even though it matches the movement's own
      // dose: this routine is about settling, so the duration is the point and
      // must survive onto the neutral-spine replacement.
      { move: "Child's pose", dose: "90 s" },
      { move: "Figure-4 stretch" },
      // Deliberately not pinned — the twist swaps to a breath drill, which has
      // no sides, and "90/90 breathing — 60 s / side" is nonsense.
      { move: "Supine twist" },
      { move: "Legs up the wall" },
    ],
  },
];

/**
 * Lymphatic drainage. Light self-massage and breathing throughout — nothing
 * here loads or bends anything, so nothing is flagged.
 */
export const LYMPH: RoutineStep[] = [
  { move: "Deep belly breathing", dose: "× 10 — opens the system" },
  { move: "Neck drainage strokes" },
  { move: "Armpit pump" },
  { move: "Abdominal circles" },
  { move: "Ankle pumps and calf strokes" },
];

/** The breathing timer on the Recover screen. Its copy comes from the library. */
export const BREATHING_MOVE = "Box breathing";

/**
 * Mobility milestones, shown on Progress.
 *
 * These are stored positionally: `profiles.mobility` is a five-element boolean
 * array with a `CHECK (array_length(mobility, 1) = 5)`. So a flagged milestone
 * is *replaced in its slot* rather than removed — slot 0 means "the hamstring
 * length milestone", and which assessment fills it depends on the profile. A
 * tick therefore stays meaningful, the array still lines up, and no migration
 * is needed.
 *
 * Milestones are assessments rather than prescriptions, so they stay inline
 * here rather than joining the movement library.
 *
 * `MILESTONE_COUNT` in `lib/local/store.ts` is the other half of this contract.
 */
export interface Milestone {
  n: string;
  contra?: MovementFlag[];
  swap?: Milestone;
}

export const MILESTONES: Milestone[] = [
  {
    n: "Touch toes with soft knees",
    // Shipped as an achievement to work toward while C20 removes the same
    // pattern from the plan. That contradiction is the reason C27 existed.
    contra: ["spinal_flexion"],
    swap: { n: "Straight-leg raise to 80°, lying down" },
  },
  {
    n: "Full-depth goblet squat",
    // Survives the osteoporosis filter — depth is not a bone-health mechanic.
    // Tagged for C21, whose OA rules cap depth and will read this flag.
    contra: ["deep_knee_flexion"],
    swap: { n: "Sit to a chair and stand, no hands" },
  },
  { n: "30 s single-leg balance / side" },
  { n: "Arms overhead, ribs down" },
  { n: "60 s side plank each side" },
];

// ── The filter ──────────────────────────────────────────────────────────────

/** A library movement, prescribed at a dose, after filtering. */
export interface ResolvedMove extends RecoveryMove {
  dose: string;
  /** The movement this replaced, when a declaration forced a swap. */
  swappedFrom?: string;
  /** Why, phrased for the user. */
  reason?: string;
}

/** A routine after filtering. Same name, same length, same stated duration. */
export interface ResolvedRoutine extends Omit<StretchRoutine, "steps"> {
  moves: ResolvedMove[];
}

function flagsOf(m: { contra?: MovementFlag[] }): MovementFlag[] {
  return m.contra ?? [];
}

/** Whether these declarations rule this movement out. */
function ruledOut(
  m: { contra?: MovementFlag[] },
  d: Pick<Declarations, "bone_health">,
): boolean {
  const removed = removedMovementFlags(d);
  return flagsOf(m).some((f) => removed.includes(f));
}

/**
 * The movement to actually prescribe for one step, carrying the reason with it
 * when a swap fires so the screen can explain itself rather than quietly
 * serving something else.
 *
 * A step naming a movement that is not in the library is a programming error
 * rather than a user-facing one, so it throws. `recovery.test.ts` walks every
 * routine to make sure that never ships.
 */
export function resolveStep(
  step: RoutineStep,
  d: Pick<Declarations, "bone_health">,
): ResolvedMove {
  const move = findRecoveryMove(step.move);
  if (!move) throw new Error(`Unknown recovery movement: ${step.move}`);
  if (!ruledOut(move, d) || !move.swap) {
    return { ...move, dose: step.dose ?? move.dose };
  }

  const replacement = findRecoveryMove(move.swap);
  if (!replacement) {
    throw new Error(`${move.n} swaps to an unknown movement: ${move.swap}`);
  }
  return {
    ...replacement,
    // The routine's explicit dose wins; otherwise the replacement's own.
    dose: step.dose ?? replacement.dose,
    swappedFrom: move.n,
    // The swap phrasing, not the withheld phrasing: the movement is in the
    // plan, and its replacement is right there on the same line.
    reason: movementSwapReason(flagsOf(move), d) ?? undefined,
  };
}

export function resolveRoutine(
  r: StretchRoutine,
  d: Pick<Declarations, "bone_health">,
): ResolvedRoutine {
  const { steps, ...rest } = r;
  return { ...rest, moves: steps.map((s) => resolveStep(s, d)) };
}

export function resolveRoutines(
  d: Pick<Declarations, "bone_health">,
): ResolvedRoutine[] {
  return STRETCHES.map((r) => resolveRoutine(r, d));
}

export function resolveLymph(
  d: Pick<Declarations, "bone_health">,
): ResolvedMove[] {
  return LYMPH.map((s) => resolveStep(s, d));
}

/**
 * The five milestones for this profile, in their stored slots. Always returns
 * exactly `MILESTONES.length` entries — Progress indexes `profile.mobility`
 * with the same index.
 */
export function milestonesFor(d: Pick<Declarations, "bone_health">): {
  n: string;
  swappedFrom?: string;
}[] {
  return MILESTONES.map((m) =>
    ruledOut(m, d) && m.swap ? { n: m.swap.n, swappedFrom: m.n } : { n: m.n },
  );
}

/**
 * Seconds to hold, read out of a dose string, or null when the dose counts
 * reps instead.
 *
 * The exercise timer counts up, because a set of eight is done when it is done.
 * Half of recovery is a stated hold — "90 s", "3 min", "45 s / side" — and a
 * stopwatch is the wrong instrument for those: it asks the user to watch the
 * screen and decide when to stop, which is exactly the decision the dose
 * already made. C29's timer counts down when this returns a number.
 */
export function holdSeconds(dose: string): number | null {
  const min = /(\d+(?:\.\d+)?)\s*min/i.exec(dose);
  if (min) return Math.round(parseFloat(min[1]) * 60);
  const sec = /(\d+)\s*s\b/i.exec(dose);
  if (sec) return parseInt(sec[1], 10);
  return null;
}

/** Whether a dose applies per side, so the timer should run twice. */
export function isPerSide(dose: string): boolean {
  return /\/\s*(side|leg|arm)/i.test(dose);
}

/** Used when the coach route is unreachable or times out. */
export const CAM_TIPS = [
  'Knees drifted inward on the last few reps — think "push the floor apart".',
  "Tempo rushed at the bottom. Own the lowering: 2 seconds down.",
  "Neck craned up — look at the floor 2 m ahead, keep it neutral.",
  "Solid set. Brace a touch earlier — before the rep starts, not during.",
  "Heels lifted on the last rep — sit back into the heels more.",
];

export const DEVICES = [
  { id: "watch", n: "Smartwatch", d: "Heart rate, workouts, sleep" },
  {
    id: "phone",
    n: "Android phone — Health Connect",
    d: "Steps, HR, sleep · first platform target",
  },
  { id: "ios", n: "iPhone — Apple HealthKit", d: "Parallel track after Android" },
  {
    id: "scale",
    n: "Smart scale",
    d: "Weight auto-logged via the linked phone",
  },
] as const;

export type DeviceId = (typeof DEVICES)[number]["id"];
