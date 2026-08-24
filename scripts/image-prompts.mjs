#!/usr/bin/env node
/**
 * C17 — generate one image prompt per movement, all sharing a style.
 *
 * Composes `assets/movement-poses.json` (what each movement looks like) with a
 * single style block (what all of them look like) into a prompt per movement,
 * and checks the pose file against the real libraries so a movement added later
 * cannot be silently missed.
 *
 *   node scripts/image-prompts.mjs                   # markdown to stdout
 *   node scripts/image-prompts.mjs --json            # machine-readable
 *   node scripts/image-prompts.mjs --out docs/…md
 *
 * The style block is not invented. It is the Industry design system's own
 * description of itself, in the readme under `project/_ds/industry-<id>/`.
 *
 *   "a wireframe: steel-blue on a light technical ground … cards, figures and
 *    buttons framed as blueprint objects … figures stay transparent line
 *    drawings … icons are thin-stroke."
 *
 * Line art rather than photography is not only a style match. It removes the
 * entire failure class C1 documented: no stranger's photograph, no junk-domain
 * collision, no image search that can return a picture of a child, and no
 * likeness or consent question for a body shown mid-exercise.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const domain = join(root, "web/src/lib/domain");

// ── The shared style. Every prompt carries this verbatim. ───────────────────

const STYLE = [
  "Technical line illustration in the style of an engineering blueprint.",
  "A single anatomical figure drawn in clean thin uniform strokes, roughly 2px",
  "at 1200px wide, with no fill and no shading — an outline drawing, not a",
  "render. Steel blue (#5980a6) linework on a flat light warm-grey ground",
  "(#f2f2f3). No other colour anywhere.",
  "",
  "The figure is schematic and anonymous: correct human proportion and joint",
  "position, but no facial features, no hair detail, no clothing detail beyond",
  "a simple vest and shorts silhouette, and nothing that identifies an age, sex",
  "or body type. It is a diagram of a movement, not a portrait of a person.",
  "",
  "Equipment (dumbbells, a chair, a wall, a towel, a doorframe) is drawn in the",
  "same thin stroke, simplified to its essential shape, in a lighter tint of",
  "the same steel blue so the body reads first.",
  "",
  "Where direction matters, add at most two thin arrows showing the path of",
  "movement. No text, no numbers, no labels, no watermark, no logo.",
  "",
  "Generous even margin around the figure. Flat ground, no vignette, no",
  "gradient, no drop shadow, no texture, no paper grain.",
].join("\n");

const NEGATIVE = [
  "photograph, photorealistic, 3D render, CGI, clay render",
  "colour beyond the two named, gradients, shading, cross-hatching, halftone",
  "gym background, mirrors, weight racks, scenery, floor lines, horizon",
  "face, facial features, identifiable person, tattoos, branded clothing",
  "text, letters, numbers, labels, arrows with text, watermark, signature, logo",
  "multiple unrelated figures, crowd, mirrored duplicate of the figure",
  "drop shadow, vignette, paper texture, sketchy or wobbly linework",
  "anatomically impossible joints, extra limbs, extra fingers",
].join("; ");

/**
 * 4:3 landscape for the whole set.
 *
 * The detail page frames media with `object-fit: contain`, so any aspect
 * displays — but a set that shares one aspect reads as a set, and a mixture
 * does not. 4:3 is the compromise that holds both a standing figure and a
 * lying-down one without either being cramped: 16:9 crops a standing press,
 * and 1:1 wastes half the frame on legs-up-the-wall.
 */
const ASPECT = "4:3 landscape, 1600 × 1200";

// ── Which movements need one ────────────────────────────────────────────────

function movementList() {
  const ex = readFileSync(join(domain, "exercises.ts"), "utf8");
  const rec = readFileSync(join(domain, "recovery-library.ts"), "utf8");
  const names = (t) =>
    [...t.matchAll(/^\s*n: "([^"]+)",\s*$/gm)].map((m) => m[1]);
  const recEntries = [
    ...rec.matchAll(/n: "([^"]+)",\s*\n\s*dose:[^\n]*\n\s*kind: "([^"]+)"/g),
  ];
  return [
    ...names(ex).map((n) => ({ n, group: "Workouts" })),
    // Every recovery movement, including drainage and breath. Those two are
    // skipped by the *photo* lookup because their names are body parts and open
    // libraries answer with anatomy photographs. A drawing has no such problem,
    // so generating art is what finally covers them.
    ...recEntries.map(([, n, kind]) => ({ n, group: `Recovery — ${kind}` })),
  ];
}

const poses = JSON.parse(
  readFileSync(join(root, "assets/movement-poses.json"), "utf8"),
);
const movements = movementList();

// Drift guard: the pose file and the libraries must name the same movements.
const missing = movements.filter((m) => !poses[m.n]).map((m) => m.n);
const stale = Object.keys(poses).filter(
  (k) => k !== "_" && !movements.some((m) => m.n === k),
);
if (missing.length || stale.length) {
  console.error("assets/movement-poses.json is out of step with the libraries:");
  for (const n of missing) console.error(`  missing pose:  ${n}`);
  for (const n of stale) console.error(`  no such movement: ${n}`);
  process.exit(1);
}

// ── Compose ─────────────────────────────────────────────────────────────────

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const prompts = movements.map(({ n, group }) => {
  const { view, pose } = poses[n];
  return {
    movement: n,
    group,
    file: `${slug(n)}.png`,
    aspect: ASPECT,
    prompt:
      `${STYLE}\n\n` +
      `SUBJECT — ${n}. ${pose[0].toUpperCase()}${pose.slice(1)}. ` +
      `Drawn from a ${view} view, the angle that makes this movement readable.\n\n` +
      `ASPECT — ${ASPECT}.`,
    negative: NEGATIVE,
  };
});

if (process.argv.includes("--json")) {
  // No process.exit here: stdout writes are asynchronous when it is a pipe,
  // and exiting immediately truncates the JSON mid-string. Let the process end
  // on its own once the write has drained.
  console.log(JSON.stringify(prompts, null, 2));
} else {

  const groups = [...new Set(prompts.map((p) => p.group))];
  const lines = [
  "# C17 — movement illustration prompts",
  "",
  `${prompts.length} images, one per movement with a detail page. Generated by`,
  "`node scripts/image-prompts.mjs` from `assets/movement-poses.json`; edit the",
  "pose file, not this document.",
  "",
  "Every prompt carries the same style block, which is the Industry design",
  "system's own description of itself. That is what makes them a set rather",
  "than 53 unrelated pictures.",
  "",
  "## Why line art rather than photography",
  "",
  "It removes the entire failure class `docs/C1-MEDIA-PASS.md` documents — no",
  "stranger's photograph, no junk-domain collision, no image search that can",
  "return a picture of a child — and it raises no likeness or consent question",
  "for a body shown mid-exercise. It also covers the drainage and breath",
  "movements that the photo lookup refuses on principle, because their names",
  "are body parts and open libraries answer with anatomy photographs.",
  "",
  "## The shared style block",
  "",
  "```",
  STYLE,
  "```",
  "",
  "## Negative prompt — the same for every image",
  "",
  "```",
  NEGATIVE,
  "```",
  "",
  `## Aspect ratio\n\n${ASPECT} for all of them. The detail page uses`,
  "`object-fit: contain` so any aspect displays, but a set that shares one",
  "aspect reads as a set and a mixture does not.",
  "",
];

  for (const g of groups) {
    lines.push(`## ${g}`, "");
    for (const p of prompts.filter((x) => x.group === g)) {
      lines.push(`### ${p.movement}`, "", `\`${p.file}\``, "", "```", p.prompt, "```", "");
    }
  }

  const out = lines.join("\n");
  const i = process.argv.indexOf("--out");
  if (i !== -1 && process.argv[i + 1]) {
    writeFileSync(join(root, process.argv[i + 1]), out + "\n");
  }
  console.log(out);
}
