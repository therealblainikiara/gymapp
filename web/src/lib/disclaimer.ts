/**
 * The liability disclaimer's version and consent line. The prose itself lives
 * in components/disclaimer-text.tsx so it stays readable as markup.
 *
 * Bumping DISCLAIMER_VERSION re-gates every existing user: the proxy compares
 * the stored `profiles.disclaimer_version` against this constant and sends
 * anyone who does not match back to the disclaimer screen. Only bump it when
 * the wording actually changes — the acceptance record is liability evidence,
 * so an accidental bump both annoys users and muddies the audit trail.
 *
 * The wording is verbatim from the prototype and is PENDING LEGAL REVIEW —
 * C5 in ECC-PLAN.md, flagged there as an external item no agent can close.
 * Do not ship to real users before counsel has read it.
 */
export const DISCLAIMER_VERSION = "2026-08-23";

export const DISCLAIMER_CONSENT =
  "I have read and accept the disclaimer. I use Gym App entirely at my own risk and accept all responsibility for my health and safety.";

/** True when this profile has accepted the wording that is currently shipping. */
export function disclaimerCurrent(profile: {
  disclaimer_accepted_at: string | null;
  disclaimer_version: string | null;
}): boolean {
  return (
    !!profile.disclaimer_accepted_at &&
    profile.disclaimer_version === DISCLAIMER_VERSION
  );
}
