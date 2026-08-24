import { describe, expect, it } from "vitest";
import {
  MEDIA_TERMS,
  isSearchable,
  mediaBase,
  pickMedia,
  relevanceKeywords,
  searchTermsFor,
  type CommonsPage,
} from "./media";
import {
  BONE_LOADING,
  EXERCISE_DB,
  MUSCLE_KEYS,
} from "./exercises";
import { RECOVERY_LIBRARY } from "./recovery";

function page(title: string, mime = "image/jpeg", index = 1): CommonsPage {
  return {
    index,
    title,
    imageinfo: [
      { url: `https://example.test/${title}`, thumburl: `https://example.test/thumb/${title}`, mime },
    ],
  };
}

describe("relevance keywords", () => {
  it("drops the stopwords that made the filter useless", () => {
    // "exercise" appears in several search overrides, so leaving it in meant
    // any junk title containing the word passed.
    expect(relevanceKeywords("step-up strength training")).not.toContain(
      "exercise",
    );
    expect(relevanceKeywords("superman exercise")).toEqual(["superman"]);
  });

  it("falls back to shorter words when nothing survives", () => {
    // "Push-up exercise" leaves only three-letter fragments; returning an
    // empty keyword set would reject every candidate.
    const kws = relevanceKeywords("hold exercise");
    expect(kws.length).toBeGreaterThan(0);
  });
});

describe("media selection", () => {
  it("accepts a relevant image", () => {
    const found = pickMedia([page("File:Push-up-1.png", "image/png")], "push-up");
    expect(found).toEqual({
      url: "https://example.test/thumb/File:Push-up-1.png",
      isVideo: false,
    });
  });

  it("returns the direct URL for video and flags it", () => {
    const found = pickMedia(
      [page("File:Goblet squat demo.webm", "video/webm")],
      "goblet squat",
    );
    expect(found).toEqual({
      url: "https://example.test/File:Goblet squat demo.webm",
      isVideo: true,
    });
  });

  it("rejects a mime type it cannot render", () => {
    // The original bug: an extension regex matched URLs with query strings.
    // Matching on the API's mime field is what fixed it.
    expect(
      pickMedia([page("File:Push-up.svg", "image/svg+xml")], "push-up"),
    ).toBeNull();
    expect(
      pickMedia([page("File:Push-up.pdf", "application/pdf")], "push-up"),
    ).toBeNull();
  });

  it("rejects an irrelevant title", () => {
    expect(
      pickMedia([page("File:A photograph of a lake.jpg")], "goblet squat"),
    ).toBeNull();
  });

  it("rejects the junk-domain collisions that keyword filtering could not", () => {
    // "Step up" legitimately appears in military exercise captions; no keyword
    // rule can separate those, so the domain blocklist does it.
    const collisions = [
      "File:Mass casualty exercise step up 2019.jpg",
      "File:Army medics step up training.jpg",
      "File:DVIDS step up drill.jpg",
    ];
    for (const title of collisions) {
      expect(pickMedia([page(title)], "step-up strength training")).toBeNull();
    }
  });

  it("prefers the API's own ranking", () => {
    const found = pickMedia(
      [
        page("File:Push-up second.jpg", "image/jpeg", 2),
        page("File:Push-up first.jpg", "image/jpeg", 1),
      ],
      "push-up",
    );
    expect(found?.url).toContain("first");
  });

  it("skips a bad candidate to reach a good one", () => {
    const found = pickMedia(
      [
        page("File:Army push-up drill.jpg", "image/jpeg", 1),
        page("File:Push-up demonstration.jpg", "image/jpeg", 2),
      ],
      "push-up",
    );
    expect(found?.url).toContain("demonstration");
  });

  it("returns null rather than guessing when nothing fits", () => {
    // The honest empty state is the point: better to say no demonstration was
    // found than to show a stranger's photo and call it a squat.
    expect(pickMedia([], "goblet squat")).toBeNull();
    expect(pickMedia([{ index: 1, title: "File:x.jpg" }], "squat")).toBeNull();
  });
});

describe("search terms", () => {
  it("uses the curated override where the exercise name searches badly", () => {
    expect(searchTermsFor("Step-up")[0]).toBe(
      "step-up strength training exercise",
    );
  });

  it("strips the dumbbell prefix when there is no override", () => {
    expect(searchTermsFor("Dumbbell curl")).toEqual(["curl exercise", "curl"]);
  });

  it("always offers a bare fallback term", () => {
    expect(searchTermsFor("Glute bridge")).toEqual([
      "Glute bridge exercise",
      "Glute bridge",
    ]);
  });
});

describe("C1 — every movement that can be searched, is accounted for", () => {
  /** Everything whose detail page runs a lookup. */
  const searchedByKind = RECOVERY_LIBRARY.filter(
    (m) => m.kind !== "drainage" && m.kind !== "breath",
  ).map((m) => m.n);
  const ALL_MOVEMENTS = [
    ...MUSCLE_KEYS.flatMap((k) => EXERCISE_DB[k].ex.map((e) => e.n)),
    ...BONE_LOADING.map((e) => e.n),
    ...searchedByKind,
  ];

  it("has an entry or a defensible default for every movement", () => {
    // The audit that opened C1 found the surface had grown from 28 to 46
    // without anyone noticing: C21 added bone loading, C29 gave 16 recovery
    // movements detail pages. This is the test that notices next time.
    for (const n of ALL_MOVEMENTS) {
      expect(mediaBase(n), n).not.toBeUndefined();
    }
    expect(ALL_MOVEMENTS.length).toBeGreaterThanOrEqual(46);
  });

  it("names no movement that no longer exists", () => {
    // A rename leaves a stale override behind, silently reverting that
    // movement to its raw name as the query.
    const known = new Set(ALL_MOVEMENTS);
    for (const k of Object.keys(MEDIA_TERMS)) {
      expect(known.has(k), `stale override: ${k}`).toBe(true);
    }
  });

  it("never searches on a keyword set an animal or a person satisfies", () => {
    // The failure this chunk exists to close. `relevanceKeywords` drops words
    // of three characters or fewer when a longer one survives, so "Bird dog"
    // filtered on `bird` and "Dead bug" on `dead` — gates any photograph
    // walks through. Those names are skipped now; this stops another arriving.
    const BARE = [
      "bird", "dog", "cat", "cow", "bug", "child", "angel", "figure",
      "march", "drop", "circles", "legs", "wall", "dead",
    ];
    for (const n of ALL_MOVEMENTS) {
      const base = mediaBase(n);
      if (base === null) continue;
      const kws = relevanceKeywords(base);
      const bare = kws.filter((w) => BARE.includes(w));
      expect(
        bare,
        `${n} searches on ${bare.join("/")} — skip it or give it a term whose words discriminate`,
      ).toEqual([]);
    }
  });

  it("never searches for a child", () => {
    // Firmer than the rest and worth its own test: a fitness app must not run
    // an image search that can return photographs of children, and no override
    // fixes that while the filter matches on the word itself.
    for (const n of ALL_MOVEMENTS) {
      const base = mediaBase(n);
      if (base === null) continue;
      expect(base.toLowerCase(), n).not.toMatch(/child|kid|baby|infant/);
    }
  });

  it("produces at least one usable keyword for everything it does search", () => {
    for (const n of ALL_MOVEMENTS) {
      const base = mediaBase(n);
      if (base === null) continue;
      expect(relevanceKeywords(base).length, `${n} has no keywords`).toBeGreaterThan(0);
    }
  });

  it("does not build a query the junk filter would reject outright", () => {
    // A search term containing a blocked word can only ever return nothing.
    for (const n of ALL_MOVEMENTS) {
      const base = mediaBase(n);
      if (base === null) continue;
      for (const term of searchTermsFor(n)) {
        expect(
          pickMedia(
            [{ index: 0, title: `${term}.jpg`, imageinfo: [{ url: "u", mime: "image/jpeg" }] }],
            base,
          ),
          `${n}: its own term is blocked by JUNK`,
        ).not.toBeNull();
      }
    }
  });

  it("makes no request at all for a skipped movement", () => {
    const skipped = Object.entries(MEDIA_TERMS).filter(([, v]) => v === null);
    expect(skipped.length).toBeGreaterThan(0);
    for (const [n] of skipped) {
      expect(searchTermsFor(n), n).toEqual([]);
      expect(isSearchable(n), n).toBe(false);
    }
  });

  it("blocks the collision domains the widened list was added for", () => {
    const base = "stamping march";
    for (const title of [
      "Marching band parade.jpg",
      "Military parade 1998.jpg",
      "Police march protest.jpg",
    ]) {
      expect(
        pickMedia(
          [{ index: 0, title, imageinfo: [{ url: "u", mime: "image/jpeg" }] }],
          base,
        ),
        title,
      ).toBeNull();
    }
  });
});
