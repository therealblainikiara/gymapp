import type { MovementFlag } from "./exercises";
import { movementRemovalReason, removedMovementFlags } from "./conditions";
import type { Declarations } from "./conditions";

/**
 * Recovery content, and the filter that keeps it honest.
 *
 * M7 / C27 — until this chunk, every step here was a bare string and nothing
 * looked at them. C20 shipped a tested guarantee that no *workout* reaches a
 * user with declared osteoporosis containing loaded spinal flexion or
 * end-range rotation; this screen was serving that same user Child's pose, a
 * supine twist and a standing hamstring reach. A filter that covers one screen
 * and not its neighbour is worse than no filter, because it manufactures trust
 * the product has not earned.
 *
 * Two things are deliberately different from the workout generator:
 *
 *   1. **Recovery swaps rather than drops.** `buildPlan` picks from a pool, so
 *      removing an exercise just means picking the next one. A stretch routine
 *      is a curated sequence with a stated duration — dropping a step leaves a
 *      three-move "8 min" routine that no longer takes 8 minutes. Every flagged
 *      move therefore carries a `swap` that serves the same purpose without the
 *      mechanic, and the UI says what changed and why.
 *
 *   2. **Injuries do not filter stretches.** A flagged knee is a reason to load
 *      it less, not a reason to stop moving it, and stripping mobility work
 *      from the joint that needs it would be the wrong kind of caution. Whether
 *      any stretch should be injury-gated is a per-movement judgement, and it
 *      belongs with the rest of the per-movement metadata in C28 — not as a
 *      blanket rule smuggled in here.
 *
 * The flag assignments below are mechanical readings of each movement, not a
 * clinical review. C5 covers that, and `docs/ECC-AUDIT.md` §7 says so out loud.
 * Each judgement call is commented at the point it is made so a clinician can
 * overturn one without reverse-engineering the rest.
 */

export interface RecoveryMove {
  /** Name and dose together, as the prototype wrote them. C28 splits these. */
  n: string;
  /** One form cue. */
  c: string;
  /** The over-40 safety note, matching what every exercise carries. */
  s: string;
  contra?: MovementFlag[];
  /**
   * What to prescribe instead when `contra` fires. Must itself be unflagged —
   * `recovery.test.ts` asserts it, because a swap that is also contraindicated
   * would pass the filter and defeat the entire chunk.
   */
  swap?: RecoveryMove;
}

export interface StretchRoutine {
  n: string;
  min: number;
  moves: RecoveryMove[];
}

export const STRETCHES: StretchRoutine[] = [
  {
    n: "Morning mobility flow",
    min: 8,
    moves: [
      {
        n: "Cat–cow × 8, slow",
        c: "Move one vertebra at a time — no rushing the middle",
        s: "Small range beats big range first thing; the spine is stiffest within an hour of waking.",
        // The evidence against flexion in osteoporosis is about *loaded* and
        // repeated end-range flexion, not a slow unloaded quadruped rock. This
        // is tagged anyway: the cost of the swap is nearly nil, and an app with
        // nobody watching the range cannot police "gentle".
        contra: ["spinal_flexion"],
        swap: {
          n: "Quadruped rock-back × 8, spine neutral",
          c: "Hips drift toward the heels; stop before the low back rounds",
          s: "Stops at the point the spine would start to curl — that stopping point is the exercise.",
        },
      },
      {
        n: "Hip circles × 10 each way",
        c: "Hands on a wall, draw the circle with the knee",
        s: "Hips warm up faster than they feel like they do — give them the full ten.",
      },
      {
        n: "World's greatest stretch × 5 / side",
        c: "Front foot flat, back knee straight, then reach up and rotate",
        s: "Excellent movement, big ask. Drop the back knee to the floor if the balance is a fight.",
        contra: ["spinal_rotation", "deep_knee_flexion"],
        swap: {
          n: "Half-kneeling hip flexor stretch × 5 / side",
          c: "Back knee down, tuck the tailbone, then ease forward",
          s: "The tuck is what makes it work — without it you hinge from the low back instead.",
        },
      },
      {
        n: "Standing hamstring reach × 8",
        c: "Soft knees, hinge from the hips, reach toward the shins",
        s: "Reach for the shins, not the floor — chasing the floor rounds the back.",
        contra: ["spinal_flexion"],
        swap: {
          n: "Supine hamstring stretch, strap or towel, 30 s / side",
          c: "On your back, loop the towel round the foot and draw the leg up",
          s: "The floor holds your back flat for you, which is the whole point of doing it this way.",
        },
      },
    ],
  },
  {
    n: "Desk reset — express",
    min: 10,
    moves: [
      {
        n: "Chin tucks × 10",
        c: "Slide the head back over the shoulders — a double chin, not a nod",
        s: "This is the single best antidote to a day at a screen. It should feel like almost nothing.",
      },
      {
        n: "Doorway chest stretch 45 s / side",
        c: "Forearm on the frame, elbow at shoulder height, step through",
        s: "Elbow no higher than the shoulder; above that the stretch moves into the joint itself.",
      },
      {
        n: "Thoracic rotations × 8 / side",
        c: "Hands behind the head, turn from the ribs, hips stay square",
        s: "Turn from the ribs. If the hips move, the low back is doing work the mid-back should.",
        contra: ["spinal_rotation"],
        swap: {
          n: "Wall angel × 8",
          c: "Back to the wall, arms slide up and down, wrists stay in contact",
          s: "Opens the same stiff mid-back without turning it. Slide only as high as contact lasts.",
        },
      },
      {
        n: "Wrist + finger opener 60 s",
        c: "Palm flat, fingers back, ease the weight forward",
        s: "Ease in. Wrists that have been on a keyboard all day do not want a sudden end-range stretch.",
      },
    ],
  },
  {
    n: "Evening unwind",
    min: 12,
    moves: [
      {
        n: "Child's pose 90 s",
        c: "Knees wide, hips back to the heels, arms long",
        s: "Put a cushion under the hips if they don't reach the heels — comfort is the objective here.",
        // Ninety seconds at end-range flexion under body weight. This one is
        // not a borderline call.
        contra: ["spinal_flexion"],
        swap: {
          n: "Quadruped rock-back hold 90 s, spine neutral",
          c: "Sit back only as far as the low back stays flat, and breathe there",
          s: "Less range, same decompression. A cushion between calves and thighs makes it restful.",
        },
      },
      {
        n: "Figure-4 stretch 60 s / side",
        c: "Ankle across the opposite knee, draw the thigh in",
        s: "On your back, not seated — the floor keeps the spine out of it.",
      },
      {
        n: "Supine twist 60 s / side",
        c: "Knees fall to one side, both shoulders stay down",
        s: "Let the knees rest on a cushion rather than forcing them to the floor.",
        contra: ["spinal_rotation"],
        swap: {
          n: "90/90 breathing, feet on a chair, 90 s",
          c: "Calves on the seat, knees at a right angle, breathe out longer than in",
          s: "The position most physios reach for to unload a tired back. Nothing to hold, nothing to twist.",
        },
      },
      {
        n: "Legs up the wall 3 min",
        c: "Hips close to the wall, legs resting, arms wide",
        s: "Come out of it slowly — standing straight up from here makes most people light-headed.",
      },
    ],
  },
];

/**
 * Lymphatic drainage. Light self-massage and breathing throughout — nothing
 * here loads or bends anything, so nothing is flagged.
 */
export const LYMPH: RecoveryMove[] = [
  {
    n: "10 deep belly breaths — opens the system",
    c: "Hand on the belly, let it rise before the chest does",
    s: "The breathing is not a warm-up for the massage; it is the part that moves the most fluid.",
  },
  {
    n: "Neck: gentle downward strokes × 10 / side",
    c: "Flat fingers, skin-deep pressure, always downward",
    s: "If the skin isn't moving with your fingers, you are pressing too hard.",
  },
  {
    n: "Armpit pump: raise + lower arms × 15",
    c: "Slow arcs, let the armpit open and close",
    s: "A pump, not a stretch — no need to reach end range at either end.",
  },
  {
    n: "Belly: slow clockwise circles × 10",
    c: "Follow the ribs down the left, up the right",
    s: "Clockwise follows the gut. Skip it after a large meal.",
  },
  {
    n: "Ankle pumps + calf strokes × 15 / leg",
    c: "Point and flex, then stroke upward toward the knee",
    s: "Upward only. This is the one people reverse, and reversing it does nothing.",
  },
];

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
    // pattern from the plan. That contradiction is the reason C27 exists.
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

export interface ResolvedMove extends RecoveryMove {
  /** The move this replaced, when a declaration forced a swap. */
  swappedFrom?: string;
  /** Why, phrased for the user. */
  reason?: string;
}

function flagsOf(m: { contra?: MovementFlag[] }): MovementFlag[] {
  return m.contra ?? [];
}

/** Whether these declarations rule this move out. */
function ruledOut(
  m: { contra?: MovementFlag[] },
  d: Pick<Declarations, "bone_health">,
): boolean {
  const removed = removedMovementFlags(d);
  return flagsOf(m).some((f) => removed.includes(f));
}

/**
 * The move to actually prescribe. Falls through to the swap when a declaration
 * rules the original out, carrying the reason with it so the screen can explain
 * itself rather than quietly serving something else.
 */
export function resolveMove(
  m: RecoveryMove,
  d: Pick<Declarations, "bone_health">,
): ResolvedMove {
  if (!ruledOut(m, d) || !m.swap) return m;
  return {
    ...m.swap,
    swappedFrom: m.n,
    reason: movementRemovalReason(flagsOf(m), d) ?? undefined,
  };
}

/** A routine after filtering. Same shape, same length, resolved moves. */
export interface ResolvedRoutine extends Omit<StretchRoutine, "moves"> {
  moves: ResolvedMove[];
}

export function resolveRoutine(
  r: StretchRoutine,
  d: Pick<Declarations, "bone_health">,
): ResolvedRoutine {
  return { ...r, moves: r.moves.map((m) => resolveMove(m, d)) };
}

export function resolveRoutines(
  d: Pick<Declarations, "bone_health">,
): ResolvedRoutine[] {
  return STRETCHES.map((r) => resolveRoutine(r, d));
}

export function resolveLymph(
  d: Pick<Declarations, "bone_health">,
): ResolvedMove[] {
  return LYMPH.map((m) => resolveMove(m, d));
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
