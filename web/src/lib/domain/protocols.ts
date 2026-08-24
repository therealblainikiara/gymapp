import type { Declarations } from "./conditions";

/**
 * M6 / C23 — the recovery protocols.
 *
 * Content plus conditional rendering: no generator changes, nothing prescribed,
 * nothing removed. These are the things a good coach would tell a 50-year-old
 * that no rep scheme can express.
 *
 * **These are not behind the clinician gate, and that is deliberate.** The gate
 * exists because prescribing exercise on the strength of a self-reported
 * diagnosis carries risk. "Keep a cold drink to hand" carries none. C20
 * established that removals are ungated because withholding is the absence of
 * programming; the same reasoning puts guidance on the other side of the same
 * line — telling someone what tends to help is not prescribing, and making them
 * find a clinician before they can read it would be the gate working against
 * them rather than for them.
 *
 * The actual programming these protocols talk around — the rep-range shift, the
 * longer rests — is C21's, and that is gated.
 */

export interface Protocol {
  id: string;
  kicker: string;
  title: string;
  /** When to use it, in a few words. */
  when: string;
  steps: string[];
  /** The why. Kept separate so the steps stay scannable. */
  note: string;
}

export const PROTOCOLS: Protocol[] = [
  {
    id: "thermoregulation",
    kicker: "THERMOREGULATION",
    title: "Training through a flush",
    when: "Before and during every session",
    steps: [
      "Train in the coolest part of the day you can manage",
      "Cold water within reach — sip through the session, not after it",
      "Layers you can strip, never one warm top",
      "Cool the wrists and the back of the neck between sets",
      "Slow down and cool down rather than stopping altogether",
    ],
    note: "A flush mid-session is common and it is not dangerous. It passes faster if you keep moving gently than if you sit down.",
  },
  {
    id: "sleep",
    kicker: "SLEEP DISRUPTION",
    title: "The 3am wake-up",
    when: "The hour before bed, and if you wake",
    steps: [
      "Bedroom at 18 °C or below — the temperature drop is what starts sleep",
      "Cotton or bamboo bedding, plus a lighter cover you can throw off",
      "Cold water by the bed so waking does not mean getting up",
      "Awake more than 20 minutes? Get up, sit somewhere dim, go back when heavy",
      "Train earlier in the day where you can",
    ],
    note: "Waking at 3–4am is the classic pattern and it is not insomnia. Lying there willing yourself back to sleep teaches the body that the bed is a place to be awake.",
  },
  {
    id: "load",
    kicker: "LOAD MANAGEMENT",
    title: "Progressing when tendons are slower",
    when: "Every time you add weight",
    steps: [
      "Add load every second week rather than every week",
      "Two easy sets before the first working set, always",
      "Sore the next day is information; sore for three days is a signal",
      "Change one thing at a time — load or reps, never both",
    ],
    note: "Oestrogen supports the collagen in tendon and ligament. As it falls, connective tissue adapts more slowly than muscle does, so the muscle is ready to go up before the tendon is. Most menopausal training injuries are that gap.",
  },
];

const BY_ID = new Map(PROTOCOLS.map((p) => [p.id, p]));

/**
 * The protocols this profile should see.
 *
 * Driven by the declaration, never by age or sex: a 43-year-old with surgical
 * menopause needs the thermoregulation protocol and a 58-year-old who declared
 * nothing does not. That is rule 1 of M6, and it is why `menopause_stage` is
 * the branch rather than `age >= 45 && sex === "f"`.
 */
export function protocolsFor(
  d: Pick<Declarations, "menopause_stage">,
): Protocol[] {
  const out: Protocol[] = [];
  if (d.menopause_stage === "peri" || d.menopause_stage === "post") {
    out.push(BY_ID.get("thermoregulation")!, BY_ID.get("sleep")!);
  }
  // Load management is a perimenopause protocol specifically: it is about the
  // rate of change, not the end state. Post-menopause the fall has happened and
  // the tendon has adapted to where it is.
  if (d.menopause_stage === "peri") out.push(BY_ID.get("load")!);
  return out;
}

/**
 * How long a warm-up should be, in the copy the plan cards show.
 *
 * The one thing in M6 that keys off age rather than a declaration, which is
 * worth defending rather than hiding: warm-up length is not condition-specific
 * programming, it is general practice for older joints, and the app's entire
 * premise is over-40s. Rule 1 is about not using age as a proxy for a
 * condition — "she is 52 so she must be menopausal" — not about pretending
 * synovial fluid does not thicken with age.
 *
 * An unknown age gets the longer warm-up, consistently with
 * `offersHealthStep`: a blank field is not evidence of being young.
 */
export const LONGER_WARMUP_AGE = 45;

export function warmUpCopy(age: number | null): string {
  return age !== null && age < LONGER_WARMUP_AGE
    ? "Joint-friendly warm-up — 5 min easy movement first"
    : "Joint-friendly warm-up — 8–10 min easy movement first, and take the first working set lighter than you think you need to";
}
