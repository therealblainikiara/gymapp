#!/usr/bin/env node
/**
 * C1 — the per-exercise media verification pass.
 *
 * Runs the real lookup against every movement whose detail page performs one,
 * and writes a report naming what each resolved to. This is the evidence C1's
 * accept criterion asks for: "every detail screen shows a relevant image or an
 * honest fallback, verified for all of them".
 *
 * It exists as a script rather than a test because it hits the network, and a
 * test suite that fails when Wikimedia is slow is a test suite people learn to
 * ignore. The offline half of the same job — that no movement searches on a
 * keyword an animal or a person satisfies — lives in `media.test.ts` and runs
 * on every commit.
 *
 *   node scripts/media-audit.mjs                 # report to stdout
 *   node scripts/media-audit.mjs --out docs/…md  # and write it
 *
 * Requires outbound access to commons.wikimedia.org. In the container this was
 * built in that host is refused by network policy (403 on CONNECT), which is
 * why the pass is still outstanding — see docs/C1-MEDIA-PASS.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web/src/lib/domain");

/** Pull the exported arrays out of the TS sources without a build step. */
function movementNames() {
  const ex = readFileSync(join(src, "exercises.ts"), "utf8");
  const rec = readFileSync(join(src, "recovery-library.ts"), "utf8");

  const names = (text) =>
    [...text.matchAll(/^\s*n: "([^"]+)",\s*$/gm)].map((m) => m[1]);

  // Recovery drainage and breath movements never search — C29.
  const recEntries = [...rec.matchAll(/n: "([^"]+)",\s*\n\s*dose:[^\n]*\n\s*kind: "([^"]+)"/g)];
  const recSearched = recEntries
    .filter(([, , kind]) => kind !== "drainage" && kind !== "breath")
    .map(([, n]) => n);

  return [...new Set([...names(ex), ...recSearched])];
}

/** Mirrors media.ts. Kept in step by `media.test.ts`, not by duplication. */
function loadMediaTerms() {
  const text = readFileSync(join(src, "media.ts"), "utf8");
  const block = text.slice(
    text.indexOf("export const MEDIA_TERMS"),
    text.indexOf("/** Whether this movement is searched at all. */"),
  );
  const out = {};
  for (const m of block.matchAll(/"([^"]+)":\s*(null|"([^"]*)")/g)) {
    out[m[1]] = m[2] === "null" ? null : m[3];
  }
  return out;
}

const STOPWORDS = ["exercise", "with", "hold", "seated", "standing"];
const JUNK =
  /military|casualty|inspection|troops|medics|dvids|navy|army|air force|soldier|marine corps|police|drill|parade|marching band|cemetery|funeral|protest|riot|weapon|firearm/i;
const OK_MIME = ["image/jpeg", "image/png", "image/gif", "video/webm"];

function relevanceKeywords(base) {
  const words = base.toLowerCase().split(/[^a-z]+/);
  const kws = words.filter((w) => w.length > 3 && !STOPWORDS.includes(w));
  if (kws.length) return kws;
  return words.filter((w) => w.length > 2 && w !== "exercise");
}

function pick(pages, base) {
  const kws = relevanceKeywords(base);
  const ordered = [...pages].sort((a, b) => (a.index ?? 9) - (b.index ?? 9));
  return (
    ordered.find((p) => {
      const info = p.imageinfo?.[0];
      if (!info || !OK_MIME.includes(info.mime)) return false;
      if (JUNK.test(p.title ?? "")) return false;
      const title = (p.title ?? "").toLowerCase().replace(/[^a-z]+/g, " ");
      return kws.some((w) => title.includes(w));
    }) ?? null
  );
}

class Unreachable extends Error {}

async function lookup(base) {
  for (const term of [`${base} exercise`, base]) {
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
    let res;
    try {
      res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
    } catch (err) {
      // A refused tunnel is not a missing image. Reporting it as an honest
      // fallback would make this file — whose whole job is evidence — lie.
      throw new Unreachable(String(err?.cause?.message ?? err?.message ?? err));
    }
    // A proxy denial arrives as a non-OK response rather than a thrown error,
    // and looks identical to "Commons had nothing" unless it is checked for.
    if (res.status === 403 || res.status === 407 || res.status >= 500) {
      throw new Unreachable(`HTTP ${res.status} from the gateway`);
    }
    if (!res.ok) continue;
    const json = await res.json();
    const pages = Object.values(json?.query?.pages ?? {});
    const hit = pick(pages, base);
    if (hit) return { term, hit };
    // Be a good citizen: Commons asks for serial requests from scripts.
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

const terms = loadMediaTerms();
const names = movementNames();
const rows = [];
let found = 0;
let skipped = 0;

for (const n of names) {
  const base =
    n in terms ? terms[n] : n.replace(/Dumbbell |dumbbell /g, "");
  if (base === null) {
    skipped++;
    rows.push({ n, verdict: "SKIPPED", detail: "never searched — see media.ts" });
    continue;
  }
  try {
    const r = await lookup(base);
    if (r) {
      found++;
      rows.push({
        n,
        verdict: r.hit.imageinfo[0].mime === "video/webm" ? "VIDEO" : "IMAGE",
        detail: `${r.hit.title}  (via "${r.term}")`,
      });
    } else {
      rows.push({ n, verdict: "FALLBACK", detail: `no honest match for "${base}"` });
    }
  } catch (err) {
    if (err instanceof Unreachable) {
      console.error(
        `\ncommons.wikimedia.org is unreachable: ${err.message}\n` +
          "Nothing was verified, so no report is written — a pass that cannot\n" +
          "reach Commons has no evidence to record.\n",
      );
      process.exit(2);
    }
    rows.push({ n, verdict: "ERROR", detail: String(err?.message ?? err) });
  }
}

const lines = [
  `# C1 media pass — ${new Date().toISOString().slice(0, 10)}`,
  "",
  `${names.length} movements · ${found} resolved · ${skipped} skipped by policy · ` +
    `${rows.filter((r) => r.verdict === "FALLBACK").length} honest fallback · ` +
    `${rows.filter((r) => r.verdict === "ERROR").length} errored`,
  "",
  "| Movement | Result | Detail |",
  "|---|---|---|",
  ...rows.map((r) => `| ${r.n} | ${r.verdict} | ${r.detail} |`),
  "",
  "Every FALLBACK row is a screen showing “no demonstration image found”, which",
  "is a correct outcome rather than a bug. Every IMAGE and VIDEO row needs a",
  "human to confirm the file actually shows the movement — the filter proves",
  "relevance by title, and a title can lie.",
];

const out = lines.join("\n");
const target = process.argv.indexOf("--out");
if (target !== -1 && process.argv[target + 1]) {
  writeFileSync(join(root, process.argv[target + 1]), out + "\n");
}
console.log(out);
