/**
 * Exercise demonstration media, ported from `loadExMedia` in the prototype.
 *
 * History matters here: the original wger.de lookup 404'd and was replaced in
 * Milestone 1 by Wikimedia Commons, then hardened over four rounds of review —
 * mime matching instead of a URL-extension regex (query strings broke it), a
 * keyword filter, stopword removal so the generic word "exercise" stops
 * matching anything, and finally a junk-domain blocklist after "step up"
 * kept resolving to a military mass-casualty exercise photo.
 *
 * This heuristic layer is meant to be replaced by a curated per-exercise media
 * library — that is C17 in ECC-PLAN.md. Until then the honest empty state is a
 * feature: it is better to say no demonstration was found than to show a
 * stranger's photograph and call it a squat.
 */

/** Search overrides where the exercise's own name is a poor query. */
export const MEDIA_TERMS: Record<string, string> = {
  "Dumbbell floor press": "dumbbell bench press",
  "Dumbbell squeeze press": "dumbbell chest press",
  "One-arm dumbbell row": "dumbbell row",
  "Superman hold": "superman exercise",
  "Prone Y-raise": "shoulder raise exercise",
  "Dumbbell Romanian deadlift": "Romanian deadlift",
  "Seated dumbbell press": "dumbbell shoulder press",
  "Overhead triceps extension": "triceps extension",
  "Chair dip": "bench dips",
  "Dead bug": "dead bug exercise",
  "Bird dog": "bird dog exercise",
  "Suitcase carry": "farmers walk",
  "Reverse lunge + curl": "lunge exercise",
  "Step-up": "step-up strength training",
  "Inchworm walk-out": "inchworm exercise",
};

const OK_MIME = ["image/jpeg", "image/png", "image/gif", "video/webm"];

/**
 * Words too generic to prove relevance. "exercise" is the one that broke the
 * filter originally: it appears in several search overrides, so any junk title
 * containing it passed.
 */
const STOPWORDS = ["exercise", "with", "hold", "seated", "standing"];

/**
 * Titles from domains that collide with fitness vocabulary. A military
 * "exercise", a fire "drill" and a police "inspection" all read as relevant to
 * a keyword filter and are never what the user wants to see.
 */
const JUNK =
  /military|casualty|inspection|troops|medics|dvids|navy|army|air force|soldier|marine corps|police|drill/i;

export interface CommonsPage {
  index?: number;
  title?: string;
  imageinfo?: { url: string; thumburl?: string; mime: string }[];
}

export interface ExerciseMedia {
  url: string;
  isVideo: boolean;
}

export function searchTermsFor(name: string): string[] {
  const base = MEDIA_TERMS[name] ?? name.replace(/Dumbbell |dumbbell /g, "");
  return [`${base} exercise`, base];
}

/** Meaningful words a candidate title must contain to count as relevant. */
export function relevanceKeywords(base: string): string[] {
  const words = base.toLowerCase().split(/[^a-z]+/);
  const kws = words.filter((w) => w.length > 3 && !STOPWORDS.includes(w));
  if (kws.length) return kws;
  // Nothing survived — fall back to shorter meaningful words so short names
  // like "Push-up" still match something.
  return words.filter((w) => w.length > 2 && w !== "exercise");
}

/**
 * Choose the best candidate from one Commons response, or null when none of
 * them can be shown honestly.
 */
export function pickMedia(
  pages: CommonsPage[],
  base: string,
): ExerciseMedia | null {
  const ordered = [...pages].sort((a, b) => (a.index ?? 9) - (b.index ?? 9));
  const kws = relevanceKeywords(base);
  const hit = ordered.find((p) => {
    const info = p.imageinfo?.[0];
    if (!info || !OK_MIME.includes(info.mime)) return false;
    if (JUNK.test(p.title ?? "")) return false;
    const title = (p.title ?? "").toLowerCase().replace(/[^a-z]+/g, " ");
    return kws.some((w) => title.includes(w));
  });
  if (!hit) return null;
  const info = hit.imageinfo![0];
  const isVideo = info.mime === "video/webm";
  return { url: isVideo ? info.url : (info.thumburl ?? info.url), isVideo };
}

function commonsUrl(term: string): string {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: term,
    gsrnamespace: "6",
    gsrlimit: "6",
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "800",
    format: "json",
    origin: "*",
  });
  return `https://commons.wikimedia.org/w/api.php?${params}`;
}

/**
 * Look up a demonstration image or clip. Resolves to null rather than
 * throwing — a failed lookup is an expected outcome, not an error.
 */
export async function fetchExerciseMedia(
  name: string,
  signal?: AbortSignal,
): Promise<ExerciseMedia | null> {
  const base = MEDIA_TERMS[name] ?? name.replace(/Dumbbell |dumbbell /g, "");
  for (const term of searchTermsFor(name)) {
    try {
      const res = await fetch(commonsUrl(term), { signal });
      if (!res.ok) continue;
      const json = await res.json();
      const pages: CommonsPage[] = Object.values(json?.query?.pages ?? {});
      const found = pickMedia(pages, base);
      if (found) return found;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // Any other failure just means this term produced nothing.
    }
  }
  return null;
}
