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
