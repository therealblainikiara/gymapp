import { describe, expect, it } from "vitest";
import { pickMedia, relevanceKeywords, searchTermsFor, type CommonsPage } from "./media";

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
