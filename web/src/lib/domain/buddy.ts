/**
 * The Mii-style fitness buddy's animation, picked from the exercise name.
 * Ported verbatim from the prototype's buddy block.
 *
 * This is still the CSS figure, not the rigged three.js character the user
 * asked for — that is C16 in ECC-PLAN.md and out of scope for M2.
 */

export interface BuddyAnimation {
  group: string;
  armL: string;
  armR: string;
  legs: string;
  label: string;
}

const INF = "2.4s ease-in-out infinite";

/**
 * M7 / C29 — the recovery counterpart.
 *
 * `buddyFor` matches on exercise-name keywords, and every recovery movement
 * falls through its patterns to the generic "steady movement — keep breathing,
 * stay tall". For a three-minute legs-up-the-wall that label is actively wrong:
 * the movement is stillness. Recovery is dispatched on `kind` instead, which is
 * data the library already carries and does not have to be guessed from a name.
 *
 * Still the CSS figure. C16 replaces both of these with the rigged character,
 * and goal 5 in ECC-PLAN.md now says it must cover recovery movements too.
 */
export function buddyForRecovery(
  kind: "mobility" | "stretch" | "breath" | "restore" | "drainage",
): BuddyAnimation {
  switch (kind) {
    case "breath":
      return {
        group: "none",
        armL: "none",
        armR: "none",
        legs: "none",
        label: "Pattern: breath — nothing moves but the belly",
      };
    case "restore":
      return {
        group: "none",
        armL: "none",
        armR: "none",
        legs: "none",
        label: "Pattern: hold — settle in and stay there",
      };
    case "stretch":
      return {
        group: `bdyBob 4s ease-in-out infinite`,
        armL: "none",
        armR: "none",
        legs: "none",
        label: "Pattern: stretch — ease to the edge, then breathe",
      };
    case "drainage":
      return {
        group: "none",
        armL: `bdySwing 3s ease-in-out infinite`,
        armR: `bdySwingR 3s ease-in-out infinite`,
        legs: "none",
        label: "Pattern: drainage — light, slow, skin-deep",
      };
    default:
      return {
        group: `bdyBob ${INF}`,
        armL: `bdySwing ${INF}`,
        armR: `bdySwingR ${INF}`,
        legs: "none",
        label: "Pattern: mobility — small honest range, repeated",
      };
  }
}

export function buddyFor(exerciseName: string): BuddyAnimation {
  const n = exerciseName.toLowerCase();
  if (/squat|lunge|step|bridge|thruster/.test(n)) {
    return {
      group: `bdyDip ${INF}`,
      armL: `bdyArmFwd ${INF}`,
      armR: `bdyArmFwd ${INF}`,
      legs: `bdyLegBend ${INF}`,
      label: "Pattern: squat / hinge — sit down and drive up",
    };
  }
  if (/press|push|pike|extension|dip/.test(n)) {
    return {
      group: "none",
      armL: `bdyPress ${INF}`,
      armR: `bdyPress ${INF}`,
      legs: "none",
      label: "Pattern: press — drive up, lower with control",
    };
  }
  if (/curl/.test(n)) {
    return {
      group: "none",
      armL: `bdyCurl ${INF}`,
      armR: `bdyCurl ${INF}`,
      legs: "none",
      label: "Pattern: curl — elbows pinned, full lowering",
    };
  }
  if (/row|pull|raise|fly|superman/.test(n)) {
    return {
      group: "none",
      armL: `bdyRow ${INF}`,
      armR: `bdyRow ${INF}`,
      legs: "none",
      label: "Pattern: pull — elbows travel past the ribs",
    };
  }
  return {
    group: "bdyBob 1.8s ease-in-out infinite",
    armL: "bdySwing 1.8s ease-in-out infinite",
    armR: "bdySwingR 1.8s ease-in-out infinite",
    legs: "none",
    label: "Pattern: steady movement — keep breathing, stay tall",
  };
}
