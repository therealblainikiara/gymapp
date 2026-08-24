import type { MovementFlag } from "./exercises";
import type {
  BoneHealth,
  ConditionKey,
  MenopauseStage,
  PelvicFloor,
  ProfileRow,
} from "@/lib/types/database";

/** Everything the user has told us about their health, in one shape. */
export type Declarations = Pick<
  ProfileRow,
  | "menopause_stage"
  | "bone_health"
  | "pelvic_floor"
  | "conditions"
  | "clinician_cleared_at"
>;

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
  p: Omit<Declarations, "clinician_cleared_at">,
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
export function conditionProgrammingActive(p: Declarations): boolean {
  return declaresProgrammingCondition(p) && !!p.clinician_cleared_at;
}

/**
 * M6 / C20 — movement mechanics that must not appear in the plan at all,
 * given what the user has declared.
 *
 * **These removals are deliberately not behind the clinician gate.** The gate
 * governs what the plan *adds*: prescribing a bone-loading impact block is
 * programming, and programming needs a clinician. Declining to prescribe a
 * loaded toe-touch to someone who has told us they have osteoporosis is not
 * programming — it is the absence of it — and making them tick a box first
 * would have the gate protecting us at their expense.
 *
 * Osteopenia is not here on purpose. It is a lower-risk finding where the
 * evidence favours loading the spine carefully over avoiding it, so C21 treats
 * it as an adjustment rather than a removal.
 */
export function removedMovementFlags(
  d: Pick<Declarations, "bone_health">,
): MovementFlag[] {
  // Vertebral fracture in osteoporosis is overwhelmingly a flexion injury, and
  // it happens at loads people do not think of as heavy.
  return d.bone_health === "osteoporosis"
    ? ["spinal_flexion", "spinal_rotation"]
    : [];
}

/**
 * Why a movement is missing from the plan, phrased for the user — or null if
 * it is not missing.
 *
 * The plan itself simply omits these, which is invisible. The exercise detail
 * page stays reachable by link and by search, so it is the one place someone
 * meets a movement we decided against, and "removed for your safety" with no
 * reason attached is exactly the sort of thing people route around.
 */
export function movementRemovalReason(
  flags: MovementFlag[],
  d: Pick<Declarations, "bone_health">,
): string | null {
  const hit = removedMovementFlags(d).filter((f) => flags.includes(f));
  if (!hit.length) return null;
  const mechanic = hit.includes("spinal_flexion")
    ? "bends the spine forward"
    : "twists the spine to end range";
  return (
    `Not in your plan. You told us you have osteoporosis, and this movement ` +
    `${mechanic} — the pattern most associated with vertebral fracture. ` +
    `Ask your clinician before you add it back.`
  );
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
