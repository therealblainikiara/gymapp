import type {
  BoneHealth,
  ConditionKey,
  MenopauseStage,
  PelvicFloor,
  ProfileRow,
} from "@/lib/types/database";

/**
 * M6 / C19 — the health declarations that shape a plan.
 *
 * Two rules from docs/M6-CONDITION-AWARE-PLAN.md are enforced here rather than
 * left to each screen:
 *
 *   1. Age decides which questions get *offered*, never what the plan does. A
 *      58-year-old with osteopenia gets bone loading; a 54-year-old without it
 *      does not. Anyone can declare anything from Setup at any age — the age
 *      thresholds below only decide what intake bothers to ask.
 *
 *   2. `sex` decides which questions are offered by default, never what fires.
 *      Perimenopause is female physiology, but a `sex === "f"` gate breaks for
 *      surgical menopause, hysterectomy and trans users, so the generator will
 *      branch on `menopause_stage` — which anyone can set.
 */

export const MENOPAUSE_OPTIONS: { id: MenopauseStage; label: string }[] = [
  { id: "pre", label: "Not started" },
  { id: "peri", label: "Perimenopause" },
  { id: "post", label: "Post-menopause" },
  { id: "undisclosed", label: "Rather not say" },
];

export const BONE_HEALTH_OPTIONS: { id: BoneHealth; label: string }[] = [
  { id: "none", label: "No issues known" },
  { id: "osteopenia", label: "Osteopenia" },
  { id: "osteoporosis", label: "Osteoporosis" },
  // Deliberately distinct from "none": never tested is not the same as tested
  // and clear, and the two lead to different programming.
  { id: "untested", label: "Never tested" },
];

export const PELVIC_FLOOR_OPTIONS: { id: PelvicFloor; label: string }[] = [
  { id: "none", label: "No issues" },
  { id: "occasional", label: "Occasional leaking" },
  { id: "diagnosed", label: "Diagnosed condition" },
];

export const CONDITIONS: {
  id: ConditionKey;
  label: string;
  note: string;
}[] = [
  {
    id: "hypertension",
    label: "High blood pressure",
    note: "Changes how we load overhead and isometric work",
  },
  {
    id: "type2_diabetes",
    label: "Type 2 diabetes",
    note: "Adds timing and foot-care guidance",
  },
  {
    id: "oa_knee",
    label: "Knee osteoarthritis",
    note: "Caps depth to your pain-free range",
  },
  {
    id: "oa_hip",
    label: "Hip osteoarthritis",
    note: "Caps depth and prefers low-impact conditioning",
  },
  {
    id: "frozen_shoulder",
    label: "Frozen shoulder",
    note: "Nothing overhead until range returns",
  },
  {
    id: "tendinopathy",
    label: "Tendinopathy",
    note: "Swaps the loaded pattern for isometrics, then slow heavy work",
  },
];

export const MENOPAUSE_LABELS = new Map(
  MENOPAUSE_OPTIONS.map((o) => [o.id, o.label]),
);
export const BONE_HEALTH_LABELS = new Map(
  BONE_HEALTH_OPTIONS.map((o) => [o.id, o.label]),
);
export const CONDITION_LABELS = new Map(CONDITIONS.map((c) => [c.id, c.label]));

/** The age at which intake starts asking. Not a gate on anything. */
export const HEALTH_QUESTION_AGE = 45;
const MENOPAUSE_QUESTION_AGE = 40;

export interface QuestionAudience {
  sex: ProfileRow["sex"];
  age: number | null;
}

/**
 * Whether intake should offer each question. Setup always shows all of them —
 * someone who is 38 with osteoporosis must still be able to say so.
 */
export function offersMenopauseQuestion({ sex, age }: QuestionAudience) {
  // Age unknown still offers it: a blank age is not evidence of being young.
  return sex === "f" && (age === null || age >= MENOPAUSE_QUESTION_AGE);
}

export function offersPelvicFloorQuestion({ sex, age }: QuestionAudience) {
  return sex === "f" || age === null || age >= HEALTH_QUESTION_AGE;
}

export function offersHealthStep({ sex, age }: QuestionAudience) {
  return (
    offersMenopauseQuestion({ sex, age }) ||
    age === null ||
    age >= HEALTH_QUESTION_AGE
  );
}

/**
 * Whether the profile has declared anything that changes programming, and so
 * needs a clinician to have been in the loop.
 *
 * "untested" bone health and a `pre`/`undisclosed` menopause stage are not
 * declarations of a condition — they do not require clearance.
 */
export function declaresProgrammingCondition(
  p: Pick<
    ProfileRow,
    "menopause_stage" | "bone_health" | "pelvic_floor" | "conditions"
  >,
): boolean {
  return (
    p.conditions.length > 0 ||
    p.bone_health === "osteopenia" ||
    p.bone_health === "osteoporosis" ||
    p.pelvic_floor === "occasional" ||
    p.pelvic_floor === "diagnosed" ||
    p.menopause_stage === "peri" ||
    p.menopause_stage === "post"
  );
}

/**
 * True when condition-specific programming is allowed to run: something was
 * declared AND a clinician has been confirmed. A self-reported diagnosis is
 * enough to ask about, not enough to program on.
 */
export function conditionProgrammingActive(
  p: Pick<
    ProfileRow,
    | "menopause_stage"
    | "bone_health"
    | "pelvic_floor"
    | "conditions"
    | "clinician_cleared_at"
  >,
): boolean {
  return declaresProgrammingCondition(p) && !!p.clinician_cleared_at;
}

// ── Validators, mirroring the CHECK constraints ─────────────────────────────
// A write the database rejects stalls every queued write behind it, so nothing
// reaches the outbox without passing through these.

const MENOPAUSE_IDS = MENOPAUSE_OPTIONS.map((o) => o.id);
const BONE_IDS = BONE_HEALTH_OPTIONS.map((o) => o.id);
const PELVIC_IDS = PELVIC_FLOOR_OPTIONS.map((o) => o.id);
const CONDITION_IDS = CONDITIONS.map((c) => c.id);

export function asMenopauseStage(v: unknown): MenopauseStage | null {
  return MENOPAUSE_IDS.includes(v as MenopauseStage)
    ? (v as MenopauseStage)
    : null;
}

export function asBoneHealth(v: unknown): BoneHealth | null {
  return BONE_IDS.includes(v as BoneHealth) ? (v as BoneHealth) : null;
}

export function asPelvicFloor(v: unknown): PelvicFloor | null {
  return PELVIC_IDS.includes(v as PelvicFloor) ? (v as PelvicFloor) : null;
}

export function asConditions(v: unknown): ConditionKey[] {
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v.filter((x): x is ConditionKey => CONDITION_IDS.includes(x as ConditionKey)),
    ),
  ];
}
