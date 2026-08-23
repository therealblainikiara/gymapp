import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { coachProvider, type CoachRequest } from "@/lib/coach/provider";

/**
 * Coach feedback for a finished set.
 *
 * Signed-in only — this route spends money on every call, so it is not an open
 * proxy. The 9-second race is inherited from Milestone 1: a coaching cue that
 * arrives after the user has started their next set is worse than a good
 * built-in tip, so the client falls back rather than waiting.
 */

export const runtime = "nodejs";

const TIMEOUT_MS = 9_000;

function clampInt(value: unknown, lo: number, hi: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function clampText(value: unknown, max: number, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

export async function POST(request: NextRequest) {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Everything is bounded before it reaches the model: this text ends up in a
  // prompt, and an unbounded field is an invitation to use the route as a
  // free-text relay to a paid API.
  const input: CoachRequest = {
    exercise: clampText(body.exercise, 80, "a strength exercise"),
    reps: clampInt(body.reps, 0, 500, 0),
    seconds: clampInt(body.seconds, 1, 3600, 1),
    goal: clampText(body.goal, 24, "general"),
    level: clampText(body.level, 24, "intermediate"),
    injuries: Array.isArray(body.injuries)
      ? body.injuries
          .filter((i): i is string => typeof i === "string")
          .slice(0, 8)
          .map((i) => i.slice(0, 24))
      : [],
  };

  const provider = coachProvider();
  if (provider.name === "unconfigured") {
    // Not an error the user should see as a failure — the client has tips.
    return NextResponse.json({ tip: null, reason: "unconfigured" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const tip = await provider.feedback(input, controller.signal);
    return NextResponse.json({ tip });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError" ? "timeout" : "error";
    if (reason === "error") {
      console.error("coach route failed", err);
    }
    return NextResponse.json({ tip: null, reason }, { status: 200 });
  } finally {
    clearTimeout(timeout);
  }
}
