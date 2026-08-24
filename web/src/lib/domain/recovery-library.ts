import type { MovementFlag } from "./exercises";
import type { InjuryKey } from "@/lib/types/database";

/**
 * The recovery movement library — M7 / C28.
 *
 * Every stretch, breath and drainage step is now a first-class movement
 * carrying what an exercise carries: cues, an over-40 safety note, an easier
 * and a harder variation, the props it needs, the joints it puts at end range,
 * and C20's movement flags. `EXERCISE_DB` is the shape being matched; the
 * differences below are all deliberate.
 *
 * **Dose lives on the routine, not the movement.** `Quadruped rock-back` was
 * two separate entries before this chunk — "× 8" in the morning flow and a
 * "90 s" hold in the evening — because name and dose were one string. Splitting
 * them makes it one movement used at two doses, which is what it always was,
 * and is what lets C29 give it a single detail page.
 *
 * **Swaps are references, not inline objects.** C27 attached each replacement
 * as a nested literal, which meant a swapped-in movement had a cue and a note
 * and nothing else — no variations, no detail page, a second-class citizen
 * prescribed to exactly the users who need the most information. Here a swap
 * names another library entry, so the replacement is as documented as the
 * thing it replaced. `recovery.test.ts` asserts every reference resolves.
 *
 * **`props` rather than `k`.** Exercises filter on dumbbells-or-not. Nothing
 * here needs a gym; what varies is whether you need a wall, a chair or a
 * towel, and those are listed so nobody starts a routine and discovers halfway
 * through that they needed something. Nothing filters on it — whether a missing
 * chair should change the routine is C30's call.
 *
 * **`av` is populated but does not filter.** C27's reasoning stands: a flagged
 * knee is a reason to load it less, not a reason to stop moving it. The
 * metadata is here so C30 can make that judgement per movement instead of
 * applying a blanket rule; today it is shown on the detail page and nothing
 * more.
 *
 * Flags are mechanical readings of each movement, not a clinical review — see
 * `docs/ECC-AUDIT.md` §7. Judgement calls are commented where they are made.
 */

export type RecoveryKind =
  | "mobility"
  | "stretch"
  | "breath"
  | "restore"
  | "drainage";

export interface RecoveryMove {
  /** Name only — never the dose. */
  n: string;
  /**
   * The dose this movement is normally done at. A routine may override it —
   * `Quadruped rock-back` is eight reps in the morning flow and a ninety-second
   * hold in the evening — but a generated session (C30) has no hand-written
   * routine to read one from, so every movement has to know its own.
   */
  dose: string;
  kind: RecoveryKind;
  /** Household items needed. Empty means nothing but the floor. */
  props: string[];
  /** Joints this puts at end range. Recorded, not filtered on — see above. */
  av: InjuryKey[];
  c: string[];
  s: string;
  e: string;
  h: string;
  contra?: MovementFlag[];
  /** Name of the library entry to prescribe instead when `contra` fires. */
  swap?: string;
}

export const RECOVERY_LIBRARY: RecoveryMove[] = [
  // ── Mobility ──────────────────────────────────────────────────────────────
  {
    n: "Cat–cow",
    dose: "× 8, slow",
    kind: "mobility",
    props: [],
    av: ["wrist", "back"],
    c: [
      "Move one vertebra at a time — no rushing the middle",
      "Let the head follow the spine, don't lead with it",
      "Breathe out as the back rounds",
    ],
    s: "Small range beats big range first thing; the spine is stiffest within an hour of waking.",
    e: "Seated on a chair, hands on the knees",
    h: "Pause 3 s at each end",
    // The evidence against flexion in osteoporosis concerns *loaded*, repeated,
    // end-range flexion — not a slow unloaded quadruped rock. Tagged anyway:
    // the swap costs almost nothing, and an app with nobody watching the range
    // cannot police "gentle".
    contra: ["spinal_flexion"],
    swap: "Quadruped rock-back",
  },
  {
    n: "Quadruped rock-back",
    dose: "× 8",
    kind: "mobility",
    props: [],
    av: ["wrist", "knee"],
    c: [
      "Hips drift toward the heels, spine held flat",
      "Stop before the low back rounds",
      "Shoulders stay away from the ears",
    ],
    s: "That stopping point is the exercise, not a failure to reach the heels. A cushion between calves and thighs makes it restful.",
    e: "Forearms down, shorter range",
    h: "Hold at the end range and breathe for 30 s",
  },
  {
    n: "Hip circles",
    dose: "× 10 each way",
    kind: "mobility",
    props: ["wall or chair for balance"],
    av: ["knee"],
    c: [
      "Hands on a wall, draw the circle with the knee",
      "Keep the standing leg soft",
      "Same size both directions",
    ],
    s: "Hips warm up faster than they feel like they do — give them the full ten.",
    e: "Smaller circles, both hands supported",
    h: "Slow the circle down until it takes 4 s",
  },
  {
    n: "World's greatest stretch",
    dose: "× 5 / side",
    kind: "mobility",
    props: [],
    av: ["knee", "back"],
    c: [
      "Front foot flat, back knee straight",
      "Elbow toward the instep, then reach up and rotate",
      "Eyes follow the reaching hand",
    ],
    s: "Excellent movement, big ask. Drop the back knee to the floor if the balance is a fight.",
    e: "Back knee down throughout",
    h: "Add a 3 s pause at the top of the rotation",
    contra: ["spinal_rotation", "deep_knee_flexion"],
    swap: "Half-kneeling hip flexor stretch",
  },
  {
    n: "Half-kneeling hip flexor stretch",
    dose: "× 5 / side",
    kind: "stretch",
    props: ["cushion for the knee"],
    av: ["knee"],
    c: [
      "Back knee down, front foot flat",
      "Tuck the tailbone under first",
      "Then ease forward — a small amount is plenty",
    ],
    s: "The tuck is what makes it work. Without it you hinge from the low back and stretch nothing.",
    e: "Hold a chair, shorter stance",
    h: "Reach the same-side arm overhead",
  },
  {
    n: "Chin tuck",
    dose: "× 10",
    kind: "mobility",
    props: [],
    av: [],
    c: [
      "Slide the head back over the shoulders",
      "A double chin, not a nod",
      "Hold 2 s, release slowly",
    ],
    s: "The single best antidote to a day at a screen. It should feel like almost nothing.",
    e: "Lying down, head on the floor",
    h: "Hold 5 s against a hand at the chin",
  },
  {
    n: "Thoracic rotation",
    dose: "× 8 / side",
    kind: "mobility",
    props: [],
    av: ["back", "shoulder"],
    c: [
      "Hands behind the head, turn from the ribs",
      "Hips stay square to the front",
      "Breathe out as you turn",
    ],
    s: "Turn from the ribs. If the hips move, the low back is doing work the mid-back should be doing.",
    e: "Seated, hands crossed on the chest",
    h: "Pause 3 s at end range",
    contra: ["spinal_rotation"],
    swap: "Wall angel",
  },
  {
    n: "Wall angel",
    dose: "× 8",
    kind: "mobility",
    props: ["wall"],
    av: ["shoulder"],
    c: [
      "Back to the wall, arms in a goalpost",
      "Slide up and down keeping the wrists in contact",
      "Ribs down — no arching to gain height",
    ],
    s: "Opens the same stiff mid-back without turning it. Slide only as high as contact lasts; height gained by arching is not gained.",
    e: "Standing a step out from the wall",
    h: "Lying on the floor instead of the wall",
  },
  {
    n: "Wrist and finger opener",
    dose: "60 s",
    kind: "stretch",
    props: [],
    av: ["wrist"],
    c: [
      "Palm flat, fingers pointing back",
      "Ease the weight forward, don't push",
      "Then flip the hand and repeat",
    ],
    s: "Ease in. Wrists that have been on a keyboard all day do not want a sudden end-range stretch.",
    e: "Standing at a table rather than on the floor",
    h: "Add a slow fist-to-spread cycle × 10",
  },

  // ── Stretch ───────────────────────────────────────────────────────────────
  {
    n: "Standing hamstring reach",
    dose: "× 8",
    kind: "stretch",
    props: [],
    av: ["back", "knee"],
    c: [
      "Soft knees, hinge from the hips",
      "Reach toward the shins",
      "Flat back the whole way down",
    ],
    s: "Reach for the shins, not the floor — chasing the floor rounds the back.",
    e: "Foot on a low step, hinge to it",
    h: "Hold the bottom for 20 s",
    contra: ["spinal_flexion"],
    swap: "Supine hamstring stretch",
  },
  {
    n: "Supine hamstring stretch",
    dose: "30 s / side",
    kind: "stretch",
    props: ["towel or strap"],
    av: ["knee"],
    c: [
      "On your back, loop the towel round the foot",
      "Draw the leg up with a straight-ish knee",
      "Other leg stays long on the floor",
    ],
    s: "The floor holds your back flat for you, which is the whole point of doing it this way.",
    e: "Bend the knee more, or loop behind the thigh",
    h: "Straighten the resting leg and press it down",
  },
  {
    n: "Doorway chest stretch",
    dose: "45 s / side",
    kind: "stretch",
    props: ["doorway"],
    av: ["shoulder"],
    c: [
      "Forearm on the frame, elbow at shoulder height",
      "Step through until you feel it across the chest",
      "Chin tucked, ribs down",
    ],
    s: "Elbow no higher than the shoulder — above that the stretch moves out of the chest and into the joint itself.",
    e: "Elbow lower, smaller step",
    h: "Turn the head away from the stretching side",
  },
  {
    n: "Child's pose",
    dose: "90 s",
    kind: "stretch",
    props: ["cushion"],
    av: ["knee", "back"],
    c: [
      "Knees wide, hips back to the heels",
      "Arms long, forehead resting",
      "Let the breath reach the low back",
    ],
    s: "Put a cushion under the hips if they don't reach the heels — comfort is the objective here, not range.",
    e: "Knees narrower, cushion under the hips",
    h: "Walk the hands to one side for a lateral stretch",
    // Ninety seconds at end-range flexion under body weight. Not a borderline
    // call, unlike cat–cow above.
    contra: ["spinal_flexion"],
    swap: "Quadruped rock-back",
  },
  {
    n: "Figure-4 stretch",
    dose: "60 s / side",
    kind: "stretch",
    props: [],
    av: ["knee"],
    c: [
      "On your back, ankle across the opposite knee",
      "Reach through and draw the thigh in",
      "Head and shoulders stay down",
    ],
    s: "On your back, not seated — the floor keeps the spine out of it.",
    e: "Feet on the floor, press the crossed knee away instead",
    h: "Draw the thigh closer and hold 90 s",
  },
  {
    n: "Supine twist",
    dose: "60 s / side",
    kind: "stretch",
    props: ["cushion"],
    av: ["back"],
    c: [
      "Knees fall to one side",
      "Both shoulders stay on the floor",
      "Breathe out into the stretch",
    ],
    s: "Let the knees rest on a cushion rather than forcing them to the floor.",
    e: "Knees only part way, cushion stacked higher",
    h: "Extend the top arm and turn the head away",
    contra: ["spinal_rotation"],
    swap: "90/90 breathing",
  },
  {
    n: "Legs up the wall",
    dose: "3 min",
    kind: "restore",
    props: ["wall"],
    av: [],
    c: [
      "Hips close to the wall, legs resting up it",
      "Arms wide, palms up",
      "Nothing to hold — let the legs be heavy",
    ],
    s: "Come out of it slowly. Standing straight up from here makes most people light-headed.",
    e: "Legs on a chair seat instead of the wall",
    h: "Stay for 5 minutes with slow nasal breathing",
  },

  // ── Breath ────────────────────────────────────────────────────────────────
  {
    n: "Box breathing",
    dose: "5 min",
    kind: "breath",
    props: [],
    av: [],
    c: [
      "In for 4, hold 4, out for 4, hold 4",
      "Through the nose the whole way",
      "Shoulders stay down — the belly does the moving",
    ],
    s: "The holds are gentle pauses, not breath-holding against pressure. If you have high blood pressure, shorten or skip the holds and just lengthen the exhale.",
    e: "Drop both holds — in for 4, out for 6",
    h: "Extend each phase to 5 or 6 s",
    // Unloaded pauses, not braced effort — see MovementFlag. The
    // blood-pressure rule reads this; the pelvic-floor rule does not.
    contra: ["breath_hold"],
  },
  {
    n: "90/90 breathing",
    dose: "90 s",
    kind: "breath",
    props: ["chair"],
    av: [],
    c: [
      "Calves on the seat, knees and hips at right angles",
      "Breathe out longer than in",
      "Feel the low back settle toward the floor",
    ],
    s: "The position most physios reach for to unload a tired back. Nothing to hold and nothing to twist.",
    e: "Fewer, slower breaths — five is enough",
    h: "Add a 3 s pause after each exhale",
  },
  {
    n: "Deep belly breathing",
    dose: "× 10",
    kind: "breath",
    props: [],
    av: [],
    c: [
      "Hand on the belly, let it rise before the chest",
      "Out through pursed lips",
      "Slow enough that ten breaths take a minute",
    ],
    s: "Not a warm-up for the drainage work — this is the part that moves the most fluid.",
    e: "Lying down with knees bent",
    h: "Lengthen the exhale to twice the inhale",
  },

  // ── Drainage ──────────────────────────────────────────────────────────────
  {
    n: "Neck drainage strokes",
    dose: "× 10 / side",
    kind: "drainage",
    props: [],
    av: [],
    c: [
      "Flat fingers, skin-deep pressure",
      "Always downward, toward the collarbone",
      "Both sides, ten each",
    ],
    s: "If the skin isn't moving with your fingers, you are pressing too hard.",
    e: "Five strokes a side, lighter still",
    h: "Add ten strokes above the collarbone first",
  },
  {
    n: "Armpit pump",
    dose: "× 15",
    kind: "drainage",
    props: [],
    av: ["shoulder"],
    c: [
      "Slow arcs, arms out and down",
      "Let the armpit open and close",
      "No reaching for end range",
    ],
    s: "A pump, not a stretch — no need to reach end range at either end.",
    e: "Elbows bent, smaller arcs",
    h: "Add a gentle hand cup over the armpit × 10",
  },
  {
    n: "Abdominal circles",
    dose: "× 10",
    kind: "drainage",
    props: [],
    av: [],
    c: [
      "Flat palm, slow clockwise circles",
      "Follow the ribs down the left, up the right",
      "Light enough to move skin, not organs",
    ],
    s: "Clockwise follows the gut. Skip it after a large meal.",
    e: "Five circles, lighter pressure",
    h: "Add ten small circles around the navel",
  },
  {
    n: "Ankle pumps and calf strokes",
    dose: "× 15 / leg",
    kind: "drainage",
    props: [],
    av: [],
    c: [
      "Point and flex the foot fully",
      "Then stroke upward toward the knee",
      "Upward only",
    ],
    s: "Upward only. This is the one people reverse, and reversing it does nothing.",
    e: "Seated with the leg supported",
    h: "Elevate the leg first, then pump",
  },
];

export const RECOVERY_BY_NAME = new Map(RECOVERY_LIBRARY.map((m) => [m.n, m]));

/** Look a recovery movement up by name. Null rather than throwing, like `findExercise`. */
export function findRecoveryMove(name: string): RecoveryMove | null {
  return RECOVERY_BY_NAME.get(name) ?? null;
}
