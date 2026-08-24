import { describe, expect, it } from "vitest";
import {
  LONGER_WARMUP_AGE,
  PROTOCOLS,
  protocolsFor,
  warmUpCopy,
} from "./protocols";
import type { MenopauseStage } from "@/lib/types/database";

const STAGES: (MenopauseStage | null)[] = [
  null,
  "pre",
  "peri",
  "post",
  "undisclosed",
];

describe("the protocol library", () => {
  it("gives every protocol steps, a note and a when", () => {
    for (const p of PROTOCOLS) {
      expect(p.steps.length, `${p.id} steps`).toBeGreaterThan(2);
      expect(p.note, `${p.id} note`).toBeTruthy();
      expect(p.when, `${p.id} when`).toBeTruthy();
      expect(p.title, `${p.id} title`).toBeTruthy();
    }
  });

  it("has unique ids", () => {
    const ids = PROTOCOLS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves nothing in the library unreachable", () => {
    // Dead content is content nobody maintains.
    const shown = new Set(
      STAGES.flatMap((menopause_stage) =>
        protocolsFor({ menopause_stage }).map((p) => p.id),
      ),
    );
    for (const p of PROTOCOLS) {
      expect(shown.has(p.id), `${p.id} is never shown`).toBe(true);
    }
  });
});

describe("which protocols a profile sees", () => {
  it("shows nothing when nothing is declared", () => {
    for (const menopause_stage of ["pre", "undisclosed", null] as const) {
      expect(protocolsFor({ menopause_stage }), String(menopause_stage)).toEqual(
        [],
      );
    }
  });

  it("shows thermoregulation and sleep from perimenopause onward", () => {
    for (const menopause_stage of ["peri", "post"] as const) {
      const ids = protocolsFor({ menopause_stage }).map((p) => p.id);
      expect(ids, menopause_stage).toContain("thermoregulation");
      expect(ids, menopause_stage).toContain("sleep");
    }
  });

  it("shows load management for perimenopause only", () => {
    // It is about the rate of change, not the end state — post-menopause the
    // fall has happened and the tendon has adapted to where it is.
    expect(protocolsFor({ menopause_stage: "peri" }).map((p) => p.id)).toContain(
      "load",
    );
    expect(
      protocolsFor({ menopause_stage: "post" }).map((p) => p.id),
    ).not.toContain("load");
  });

  it("branches on the declaration, never on age or sex", () => {
    // Rule 1 of M6. A 43-year-old with surgical menopause needs these; a
    // 58-year-old who declared nothing does not. The signature takes only
    // `menopause_stage`, so age cannot leak in as a proxy.
    const args = protocolsFor.length;
    expect(args).toBe(1);
    expect(protocolsFor({ menopause_stage: "peri" }).length).toBeGreaterThan(0);
  });

  it("is not behind the clinician gate", () => {
    // Guidance, not programming. Making someone find a clinician before they
    // can read "keep a cold drink to hand" would be the gate working against
    // them. The signature does not accept `clinician_cleared_at` at all.
    expect(protocolsFor({ menopause_stage: "peri" }).length).toBe(3);
  });

  it("returns the same protocols in the same order every time", () => {
    const a = protocolsFor({ menopause_stage: "peri" }).map((p) => p.id);
    const b = protocolsFor({ menopause_stage: "peri" }).map((p) => p.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("warm-up length", () => {
  it("is longer from 45", () => {
    expect(warmUpCopy(LONGER_WARMUP_AGE)).toContain("8–10 min");
    expect(warmUpCopy(60)).toContain("8–10 min");
  });

  it("is the standard five below that", () => {
    expect(warmUpCopy(LONGER_WARMUP_AGE - 1)).toContain("5 min");
    expect(warmUpCopy(30)).toContain("5 min");
  });

  it("gives an unknown age the longer warm-up", () => {
    // Consistent with `offersHealthStep`: a blank field is not evidence of
    // being young, and the cost of an extra five minutes is nil.
    expect(warmUpCopy(null)).toContain("8–10 min");
  });

  it("always names a warm-up", () => {
    for (const age of [null, 18, 44, 45, 90]) {
      expect(warmUpCopy(age), String(age)).toContain("warm-up");
    }
  });
});
