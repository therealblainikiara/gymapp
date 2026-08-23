import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey } from "@/lib/env";

/**
 * Coach feedback, behind a provider interface.
 *
 * The prototype called `window.claude.complete` straight from the page, which
 * only works inside the design tool. The handoff's rule for the real build is
 * that the key never reaches the client, so the call moves server-side.
 *
 * The interface exists because the model choice is explicitly an open
 * decision: the options on the table are a project-wide key (what this does),
 * a bring-your-own-key flow, or a different provider entirely. Swapping any of
 * those in means writing one more implementation of `CoachProvider` and
 * changing the export at the bottom — no route or UI changes.
 */

export interface CoachRequest {
  exercise: string;
  reps: number;
  seconds: number;
  goal: string;
  level: string;
  injuries: string[];
}

export interface CoachProvider {
  readonly name: string;
  /** Resolves to one coaching cue, or throws so the caller can fall back. */
  feedback(input: CoachRequest, signal: AbortSignal): Promise<string>;
}

/** Verbatim from the prototype's `toggleSet`. */
const SYSTEM_PROMPT =
  "You are a direct, encouraging strength coach for clients over 40. " +
  "Reply with ONE concrete coaching cue about tempo, form or pacing. " +
  "Max 2 short sentences. No preamble.";

export function buildUserMessage(input: CoachRequest): string {
  const injuries = input.injuries.length ? input.injuries.join(", ") : "none";
  const perRep = (input.seconds / Math.max(1, input.reps)).toFixed(1);
  return (
    `Client just finished a set of ${input.exercise}: ` +
    `${input.reps} reps in ${input.seconds} seconds (${perRep} s per rep). ` +
    `Goal: ${input.goal}. Level: ${input.level}. ` +
    `Injuries to work around: ${injuries}.`
  );
}

class AnthropicCoach implements CoachProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async feedback(input: CoachRequest, signal: AbortSignal): Promise<string> {
    const response = await this.client.messages.create(
      {
        // Haiku is what the handoff specifies, and it is the right call: this
        // is one short cue on a tight latency budget, generated between sets.
        model: "claude-haiku-4-5",
        // Two short sentences. Room to finish a thought, not to write an essay.
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(input) }],
      },
      { signal },
    );

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ")
      .trim();

    if (!text) throw new Error("empty completion");
    return text;
  }
}

/** Null object for deployments with no key configured. */
class UnconfiguredCoach implements CoachProvider {
  readonly name = "unconfigured";
  async feedback(): Promise<string> {
    throw new Error("No coach provider configured");
  }
}

let cached: CoachProvider | null = null;

export function coachProvider(): CoachProvider {
  if (!cached) {
    const key = anthropicApiKey();
    cached = key ? new AnthropicCoach(key) : new UnconfiguredCoach();
  }
  return cached;
}
