/** Recovery content and camera fallbacks, ported verbatim from the prototype. */

export interface StretchRoutine {
  n: string;
  min: number;
  steps: string[];
}

export const STRETCHES: StretchRoutine[] = [
  {
    n: "Morning mobility flow",
    min: 8,
    steps: [
      "Cat–cow × 8, slow",
      "Hip circles × 10 each way",
      "World’s greatest stretch × 5 / side",
      "Standing hamstring reach × 8",
    ],
  },
  {
    n: "Desk reset — express",
    min: 10,
    steps: [
      "Chin tucks × 10",
      "Doorway chest stretch 45 s / side",
      "Thoracic rotations × 8 / side",
      "Wrist + finger opener 60 s",
    ],
  },
  {
    n: "Evening unwind",
    min: 12,
    steps: [
      "Child’s pose 90 s",
      "Figure-4 stretch 60 s / side",
      "Supine twist 60 s / side",
      "Legs up the wall 3 min",
    ],
  },
];

export const LYMPH = [
  "10 deep belly breaths — opens the system",
  "Neck: gentle downward strokes × 10 / side",
  "Armpit pump: raise + lower arms × 15",
  "Belly: slow clockwise circles × 10",
  "Ankle pumps + calf strokes × 15 / leg",
];

export const MILESTONES = [
  "Touch toes with soft knees",
  "Full-depth goblet squat",
  "30 s single-leg balance / side",
  "Arms overhead, ribs down",
  "60 s side plank each side",
];

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
