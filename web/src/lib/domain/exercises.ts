import type { InjuryKey, MuscleKey } from "@/lib/types/database";

/**
 * The exercise library, ported verbatim from the `DB` object in
 * `Gym App v2.dc.html`. Every cue, safety note and variation was
 * user-approved during the design sessions — do not paraphrase them.
 *
 *   k  — equipment: 'bw' bodyweight, 'db' needs dumbbells
 *   av — joints this movement loads; a flagged injury removes the exercise
 *   c  — form cues
 *   s  — over-40 joint-safety note
 *   e/h — easier / harder variation
 */
export interface Exercise {
  n: string;
  k: "bw" | "db";
  av: InjuryKey[];
  c: string[];
  s: string;
  e: string;
  h: string;
}

export interface MuscleGroup {
  label: string;
  ex: Exercise[];
}

export const EXERCISE_DB: Record<MuscleKey, MuscleGroup> = {
  chest: {
    label: "Chest",
    ex: [
      {
        n: "Dumbbell floor press",
        k: "db",
        av: [],
        c: [
          "Elbows at 45°, not flared wide",
          "Light touch at the floor, then drive",
          "Exhale on the press",
        ],
        s: "The floor limits shoulder depth — kinder to over-40 shoulders than a deep bench press.",
        e: "Incline push-up on a counter",
        h: "Slow 3-second lowering",
      },
      {
        n: "Push-up",
        k: "bw",
        av: ["wrist"],
        c: [
          "One straight line, head to heels",
          "Hands under shoulders",
          "Squeeze glutes throughout",
        ],
        s: "Wrists cranky? Do them on dumbbells to keep wrists neutral.",
        e: "Hands on a bench or counter",
        h: "Feet elevated",
      },
      {
        n: "Incline push-up",
        k: "bw",
        av: ["wrist"],
        c: [
          "Hands on a sturdy surface",
          "Chest to the edge, not chin",
          "Slow down, brisk up",
        ],
        s: "The higher the hands, the easier — pick a height where 12 clean reps is possible.",
        e: "Wall push-up",
        h: "Lower surface",
      },
      {
        n: "Dumbbell squeeze press",
        k: "db",
        av: [],
        c: [
          "Press dumbbells together hard",
          "Keep them touching the whole rep",
          "Slow and controlled",
        ],
        s: "The squeeze keeps shoulders packed — a joint-friendly chest builder.",
        e: "Lighter pair, floor press",
        h: "Pause 2 s at the bottom",
      },
    ],
  },
  back: {
    label: "Back",
    ex: [
      {
        n: "One-arm dumbbell row",
        k: "db",
        av: [],
        c: [
          "Flat back, hand braced on a bench",
          "Pull elbow to hip, not to armpit",
          "No torso twist",
        ],
        s: "The brace protects the lower back — never row bent over unsupported with heavy load.",
        e: "Both hands braced, lighter bell",
        h: "Pause 1 s at the top",
      },
      {
        n: "Bent-over dumbbell row",
        k: "db",
        av: ["back"],
        c: [
          "Hinge, don’t bow — hips back",
          "Chest proud, neck neutral",
          "Pull both elbows past the ribs",
        ],
        s: "Keep the hinge shallow (30–45°) to spare the lumbar spine.",
        e: "Chest-supported on an incline",
        h: "Slow 3-second lowering",
      },
      {
        n: "Superman hold",
        k: "bw",
        av: ["back"],
        c: [
          "Lift chest and thighs a few cm",
          "Reach long, don’t crane the neck",
          "Breathe — no breath holding",
        ],
        s: "Lift low and long; height is not the goal. Skip if it pinches the low back.",
        e: "Arms by your sides",
        h: "Hold 20–30 s",
      },
      {
        n: "Prone Y-raise",
        k: "bw",
        av: [],
        c: [
          "Thumbs up to the ceiling",
          "Lift from the shoulder blades",
          "Small, honest range",
        ],
        s: "Excellent for posture and shoulder health — the range is small on purpose.",
        e: "Standing, hinged at 45°",
        h: "Add tiny dumbbells (1–2 kg)",
      },
    ],
  },
  legs: {
    label: "Legs",
    ex: [
      {
        n: "Goblet squat",
        k: "db",
        av: ["knee"],
        c: [
          "Bell tight to the chest",
          "Sit between the heels",
          "Knees track over the toes",
        ],
        s: "The front load keeps the torso upright — the safest squat for most over-40 knees and backs.",
        e: "Squat to a box or chair",
        h: "Pause 2 s at the bottom",
      },
      {
        n: "Dumbbell Romanian deadlift",
        k: "db",
        av: ["back"],
        c: [
          "Hips back, soft knees",
          "Bells slide down the thighs",
          "Stop where the hamstrings load",
        ],
        s: "Range ends where your hamstrings say so — never chase the floor with a rounding back.",
        e: "Shorter range, lighter bells",
        h: "Single-leg version, supported",
      },
      {
        n: "Split squat",
        k: "bw",
        av: ["knee"],
        c: [
          "Long stance, torso tall",
          "Back knee drops straight down",
          "Front heel stays planted",
        ],
        s: "Hold a wall or chair for balance — balance is trainable, falling is not.",
        e: "Hold support, shorter drop",
        h: "Add dumbbells at the sides",
      },
      {
        n: "Glute bridge",
        k: "bw",
        av: [],
        c: [
          "Heels close to the hips",
          "Squeeze glutes at the top",
          "Ribs down — no back arch",
        ],
        s: "Wakes up glutes that sitting puts to sleep; zero joint load.",
        e: "Smaller range",
        h: "Single-leg, 3 s hold",
      },
    ],
  },
  shoulders: {
    label: "Shoulders",
    ex: [
      {
        n: "Seated dumbbell press",
        k: "db",
        av: ["shoulder"],
        c: [
          "Forearms vertical the whole rep",
          "Press up and slightly in",
          "Ribs down, no back arch",
        ],
        s: "Seated with back support spares the lower back; stop the range where the shoulder stays happy.",
        e: "Alternate arms",
        h: "Standing, braced core",
      },
      {
        n: "Lateral raise",
        k: "db",
        av: ["shoulder"],
        c: [
          "Lead with the elbows",
          "Stop at shoulder height",
          "Pour-the-jug wrist at the top",
        ],
        s: "Light weight, high control — heavy lateral raises are how shoulders get angry.",
        e: "Partial range, lighter",
        h: "Slow 3-second lowering",
      },
      {
        n: "Pike push-up",
        k: "bw",
        av: ["shoulder", "wrist"],
        c: [
          "Hips high, make an A-shape",
          "Head travels toward the floor",
          "Elbows at 45°",
        ],
        s: "A shoulder press with body weight — bend more at the hips to make it easier.",
        e: "Hands elevated on a step",
        h: "Feet elevated",
      },
      {
        n: "Dumbbell front raise",
        k: "db",
        av: ["shoulder"],
        c: ["One arm at a time", "Stop at eye height", "No swing — strict"],
        s: "Keep it light; momentum here transfers straight into the shoulder joint.",
        e: "Both hands, one bell",
        h: "Pause 1 s at the top",
      },
    ],
  },
  arms: {
    label: "Arms",
    ex: [
      {
        n: "Dumbbell curl",
        k: "db",
        av: [],
        c: [
          "Elbows pinned to the ribs",
          "Full lowering every rep",
          "No hip swing",
        ],
        s: "Full range with control beats heavy and half — elbows like it that way.",
        e: "Alternate arms, lighter",
        h: "Slow 3-second lowering",
      },
      {
        n: "Overhead triceps extension",
        k: "db",
        av: ["shoulder"],
        c: [
          "Both hands on one bell",
          "Elbows point forward, stay narrow",
          "Stretch at the bottom, squeeze up",
        ],
        s: "Skip the deep stretch if the elbow complains; shorten the range instead.",
        e: "Seated with back support",
        h: "Single-arm version",
      },
      {
        n: "Chair dip",
        k: "bw",
        av: ["shoulder", "wrist"],
        c: [
          "Shoulders down, away from ears",
          "Elbows point straight back",
          "Shallow beats sore",
        ],
        s: "Keep the dip shallow — deep dips are a common over-40 shoulder complaint.",
        e: "Feet closer, less depth",
        h: "Feet elevated on a second chair",
      },
      {
        n: "Hammer curl",
        k: "db",
        av: [],
        c: [
          "Thumbs up the whole rep",
          "Squeeze at the top",
          "Control the way down",
        ],
        s: "The neutral grip is the most forearm- and elbow-friendly curl.",
        e: "Alternate arms",
        h: "Pause 1 s at the top",
      },
    ],
  },
  core: {
    label: "Core",
    ex: [
      {
        n: "Dead bug",
        k: "bw",
        av: [],
        c: [
          "Low back gently pressed down",
          "Opposite arm and leg reach",
          "Slow — 3 s per rep",
        ],
        s: "The gold-standard safe core drill: all the work, none of the spine flexion.",
        e: "Legs only",
        h: "Hold a light bell overhead",
      },
      {
        n: "Side plank",
        k: "bw",
        av: ["shoulder"],
        c: [
          "One straight line, hips high",
          "Elbow under the shoulder",
          "Breathe normally",
        ],
        s: "From the knees is the right starting point — progress the lever, not the pain.",
        e: "From the knees",
        h: "Top leg raised",
      },
      {
        n: "Bird dog",
        k: "bw",
        av: ["wrist"],
        c: [
          "Flat back — balance a cup on it",
          "Reach long, not high",
          "Pause 2 s per rep",
        ],
        s: "Builds the rotational stiffness that protects the back in daily life.",
        e: "Arm only, then leg only",
        h: "Elbow-to-knee touch between reps",
      },
      {
        n: "Suitcase carry",
        k: "db",
        av: [],
        c: [
          "One heavy bell, one side",
          "Walk tall — no lean",
          "Shoulders level",
        ],
        s: "Carries train the core the way life loads it. Swap sides halfway.",
        e: "Lighter bell, shorter walk",
        h: "Heavier bell, 40 m",
      },
    ],
  },
  full: {
    label: "Full body",
    ex: [
      {
        n: "Dumbbell thruster",
        k: "db",
        av: ["shoulder", "knee"],
        c: [
          "Squat, then drive into the press",
          "One fluid motion",
          "Exhale at the top",
        ],
        s: "Light bells, smooth rhythm — this is a conditioning move, not a max lift.",
        e: "Squat + press as two moves",
        h: "Heavier, slower squat phase",
      },
      {
        n: "Reverse lunge + curl",
        k: "db",
        av: ["knee"],
        c: [
          "Step back, not forward",
          "Curl during the stand-up",
          "Tall torso",
        ],
        s: "Reverse lunges load the knee far less than forward lunges.",
        e: "Bodyweight lunge only",
        h: "Add a press at the top",
      },
      {
        n: "Step-up",
        k: "bw",
        av: ["knee"],
        c: [
          "Whole foot on the step",
          "Drive through the heel",
          "Control the way down",
        ],
        s: "Start with a low step; the way DOWN is where knees complain.",
        e: "Lower step, hold support",
        h: "Add dumbbells",
      },
      {
        n: "Inchworm walk-out",
        k: "bw",
        av: ["wrist"],
        c: [
          "Walk hands out to a plank",
          "Soft knees on the fold",
          "Add a push-up if fresh",
        ],
        s: "A warm-up and a core drill in one — keep the walk slow.",
        e: "Walk to half plank",
        h: "Push-up at the bottom",
      },
    ],
  },
};

export const MUSCLE_KEYS = Object.keys(EXERCISE_DB) as MuscleKey[];

export const INJURIES: ReadonlyArray<readonly [InjuryKey, string]> = [
  ["knee", "Knee"],
  ["shoulder", "Shoulder"],
  ["back", "Lower back"],
  ["wrist", "Wrist / elbow"],
];

export function injuryLabel(id: InjuryKey): string {
  return INJURIES.find(([k]) => k === id)?.[1] ?? id;
}

/** Look an exercise up by name and report which group it came from. */
export function findExercise(
  name: string,
): (Exercise & { muscle: string }) | null {
  for (const key of MUSCLE_KEYS) {
    const hit = EXERCISE_DB[key].ex.find((x) => x.n === name);
    if (hit) return { ...hit, muscle: EXERCISE_DB[key].label };
  }
  return null;
}

/** URL-safe id for the exercise-detail route. */
export function exerciseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function exerciseFromSlug(slug: string): string | null {
  for (const key of MUSCLE_KEYS) {
    const hit = EXERCISE_DB[key].ex.find((x) => exerciseSlug(x.n) === slug);
    if (hit) return hit.n;
  }
  return null;
}
