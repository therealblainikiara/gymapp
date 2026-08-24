import type { MovementFlag } from "./exercises";
import { conditionProgrammingActive, type Declarations } from "./conditions";

/**
 * M6 / C21 — the programming rules.
 *
 * Each rule is a pure function of what the user declared. They compose into one
 * `Adjustments` value that `buildPlan` reads, and every one of them that changes
 * anything says so in `reasons`, because the whole point of M6 is a plan that
 * can explain itself: "heavier sets — you told us you're perimenopausal" rather
 * than a rep range that silently moved.
 *
 * ## Two rules about the rules
 *
 * **Removals are never gated; additions and adjustments always are.** This is
 * the asymmetry C20 established and it is load-bearing here, where most of the
 * rules do both. Withholding an overhead press from someone with a frozen
 * shoulder is the absence of programming and happens the moment they declare
 * it. Adding a bone-loading block, moving their rep range, restructuring their
 * week — that is programming, and it waits for `clinician_cleared_at`.
 *
 * **Removals win over additions.** The bone rule appends impact work; the
 * pelvic-floor rule removes impact. Rather than special-casing that pair, the
 * block is appended and then run through the same `safe()` filter as everything
 * else, so it empties itself — and `boneLoadingBlocked` exists so the screen can
 * say why instead of showing a bone-loading block with nothing in it.
 *
 * ## What is deliberately not here
 *
 * The tendinopathy rule in the M6 table reads "swaps the affected pattern for
 * isometrics, then slow heavy resistance". `conditions` records *that* there is
 * a tendinopathy, not *where*, so there is no affected pattern to swap. It is a
 * coaching note until the intake asks which tendon. Inventing a swap from a
 * condition list that cannot name a site would be worse than saying so.
 */

export interface Adjustments {
  /** Mechanics the plan must not contain. Never gated. */
  removes: MovementFlag[];
  /**
   * Rep range override, or null to keep the goal's own. Gated.
   *
   * Applies to every prescribed movement, not only the big lifts: the library
   * carries no compound/accessory distinction, and inventing one to narrow this
   * would be a guess dressed as a rule. The reason string says "your lifts"
   * rather than "compound lifts" so the claim matches the behaviour.
   */
  reps: string | null;
  /** Seconds added to every prescribed rest. Gated. */
  extraRestSec: number;
  /** Append the impact block twice a week. Gated. */
  boneLoading: boolean;
  /** Bone loading was asked for and another declaration removed it. */
  boneLoadingBlocked: boolean;
  /** Minimum full-body sessions a week, regardless of goal. Gated. */
  minFullBodyDays: number;
  /** Coaching lines for the day. Gated. */
  notes: string[];
  /** User-facing "why your plan looks like this". Always shown. */
  reasons: string[];
}

const NONE: Adjustments = {
  removes: [],
  reps: null,
  extraRestSec: 0,
  boneLoading: false,
  boneLoadingBlocked: false,
  minFullBodyDays: 0,
  notes: [],
  reasons: [],
};

function declaresLowBone(d: Declarations): boolean {
  return d.bone_health === "osteopenia" || d.bone_health === "osteoporosis";
}

function declaresPelvicFloor(d: Declarations): boolean {
  return d.pelvic_floor === "occasional" || d.pelvic_floor === "diagnosed";
}

function declaresMenopause(d: Declarations): boolean {
  return d.menopause_stage === "peri" || d.menopause_stage === "post";
}

function has(d: Declarations, key: string): boolean {
  return d.conditions.includes(key as Declarations["conditions"][number]);
}

// ── Removals: what the plan must not contain. Never gated. ──────────────────

/**
 * The mechanics ruled out by these declarations.
 *
 * Called by `conditions.removedMovementFlags`, which is what `safe()` and the
 * recovery filter both read, so a rule added here reaches every screen at once.
 * That is the M7 lesson: a filter covering one screen and not its neighbour is
 * worse than no filter.
 */
export function removalsFor(d: Declarations): MovementFlag[] {
  const out = new Set<MovementFlag>();

  // Vertebral fracture in osteoporosis is overwhelmingly a flexion injury, and
  // it happens at loads people do not think of as heavy. Osteopenia is not
  // here: it is a lower-risk finding where the evidence favours loading the
  // spine carefully over avoiding it, so it gets the bone block instead.
  if (d.bone_health === "osteoporosis") {
    out.add("spinal_flexion");
    out.add("spinal_rotation");
  }

  // Impact and braced effort under load are the two things that spike
  // intra-abdominal pressure. `breath_hold` is deliberately not here — see the
  // MovementFlag comment.
  if (declaresPelvicFloor(d)) {
    out.add("impact");
    out.add("valsalva");
  }

  // Sustained isometrics raise blood pressure sharply and predictably. Maximal
  // overhead work does too, but "maximal" is a load, not a movement: the
  // overhead press stays and gets longer rests and an exhale cue instead of
  // being taken away from someone who can press perfectly safely.
  if (has(d, "hypertension")) out.add("isometric_hold");

  // Capping depth, implemented as declining to prescribe movements that need
  // depth to be themselves.
  if (has(d, "oa_knee") || has(d, "oa_hip")) out.add("deep_knee_flexion");

  if (has(d, "frozen_shoulder")) out.add("overhead");

  return [...out];
}

// ── The rule set ────────────────────────────────────────────────────────────

export function applyRules(d: Declarations): Adjustments {
  const removes = removalsFor(d);
  const gated = conditionProgrammingActive(d);

  const a: Adjustments = {
    ...NONE,
    removes,
    notes: [],
    reasons: [],
  };

  // Removals happen whether or not a clinician has been in the loop, so their
  // reasons are collected before the gate.
  if (declaresPelvicFloor(d)) {
    a.reasons.push(
      "No impact or heavy braced lifting — you told us about pelvic floor symptoms.",
    );
  }
  if (has(d, "frozen_shoulder")) {
    a.reasons.push(
      "Nothing overhead while the shoulder is restricted. Below-shoulder strength only.",
    );
  }
  if (has(d, "oa_knee") || has(d, "oa_hip")) {
    a.reasons.push(
      "Depth capped to your pain-free range — box squats and a lower step instead.",
    );
  }
  if (has(d, "hypertension")) {
    a.reasons.push("Long holds dropped — you told us about blood pressure.");
  }

  if (!gated) {
    // Something is declared but no clinician has confirmed it, or nothing is
    // declared at all. Either way the plan is not adjusted, only filtered.
    return a;
  }

  // ── Bone loading ─────────────────────────────────────────────────────────
  // Bone responds to load that arrives fast, not load that arrives heavy.
  if (declaresLowBone(d)) {
    const blocked = removes.includes("impact");
    a.boneLoading = !blocked;
    a.boneLoadingBlocked = blocked;
    a.reasons.push(
      blocked
        ? "Bone loading would normally be added twice a week for your bone " +
          "health, but impact work is the one thing your pelvic floor rules " +
          "out. Ask your clinician which matters more for you."
        : "Impact work added twice a week — bone responds to load that arrives " +
          "fast, not load that arrives heavy.",
    );
    if (!blocked && has(d, "hypertension")) {
      a.notes.push(
        "Keep the impact submaximal and breathe out on each landing — never hold your breath through a set.",
      );
    }
  }

  // ── Rep-range shift ──────────────────────────────────────────────────────
  // Oestrogen withdrawal costs fast-twitch fibre and bone. Heavier, lower-rep
  // compound work is the response with the best evidence behind it.
  if (declaresMenopause(d)) {
    a.reps = "6–8";
    a.reasons.push(
      "Your lifts moved to 6–8 reps at a heavier load — you told us you are " +
        (d.menopause_stage === "peri" ? "perimenopausal" : "post-menopausal") +
        ".",
    );
  }

  // ── Blood pressure ───────────────────────────────────────────────────────
  if (has(d, "hypertension")) {
    a.extraRestSec = 30;
    a.notes.push(
      "Breathe out on every effort. If you find yourself straining silently, the load is too heavy.",
    );
    a.reasons.push("Rests lengthened by 30 s, with an exhale cue on each lift.");
  }

  // ── Tendinopathy — a note, because the site is not recorded ───────────────
  if (has(d, "tendinopathy")) {
    a.notes.push(
      "For the affected tendon: 5 × 45 s isometric holds at a comfortable load daily, then slow heavy resistance once it settles. Ask your clinician which pattern to swap.",
    );
    a.reasons.push(
      "Tendinopathy protocol added as guidance — we do not record which tendon, so nothing was swapped automatically.",
    );
  }

  // ── Type 2 diabetes ──────────────────────────────────────────────────────
  if (has(d, "type2_diabetes")) {
    a.notes.push(
      "Train 30–60 min after a meal where you can, and check your feet after every session.",
    );
  }

  // ── OA conditioning preference ───────────────────────────────────────────
  if (has(d, "oa_knee") || has(d, "oa_hip")) {
    a.notes.push(
      "For conditioning, cycling and swimming load the joint far less than running.",
    );
  }

  // ── Resistance floor ─────────────────────────────────────────────────────
  // The one rule that fires on any of the declarations rather than a specific
  // one: everything M6 covers is downstream of losing muscle and bone, and no
  // goal preset is a reason to train resistance less than twice a week.
  if (declaresLowBone(d) || declaresMenopause(d)) {
    a.minFullBodyDays = 2;
    a.reasons.push(
      "At least two full-body resistance sessions a week, whatever the goal.",
    );
  }

  // Two rules can arrive at the same advice — the bone-and-blood-pressure
  // composition and the blood-pressure rule both say to breathe out — and a
  // card repeating itself reads as a bug rather than as emphasis.
  a.notes = [...new Set(a.notes)];
  a.reasons = [...new Set(a.reasons)];
  return a;
}

/** Whether these declarations change anything at all about the plan. */
export function adjustsPlan(a: Adjustments): boolean {
  return (
    a.removes.length > 0 ||
    a.reps !== null ||
    a.extraRestSec > 0 ||
    a.boneLoading ||
    a.boneLoadingBlocked ||
    a.minFullBodyDays > 0 ||
    a.notes.length > 0
  );
}
