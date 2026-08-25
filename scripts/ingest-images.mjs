#!/usr/bin/env node
/**
 * C17 — merge finished illustrations into the app.
 *
 * Drop the PNGs into `web/public/movements/` and run this. It checks every
 * file against the real movement list, then rewrites the `CURATED` set in
 * `media.ts` so the app starts serving them.
 *
 *   node scripts/ingest-images.mjs            # report only
 *   node scripts/ingest-images.mjs --write    # and update media.ts
 *
 * The check is the point. A filename that does not match a movement slug is
 * an image nobody will ever see — `curatedMedia()` builds the path from the
 * slug, so `goblet_squat.png` or `Goblet Squat.png` resolve to nothing and
 * fail silently. This names them instead.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const domain = join(root, "web/src/lib/domain");
const dir = join(root, "web/public/movements");

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function movements() {
  const ex = readFileSync(join(domain, "exercises.ts"), "utf8");
  const rec = readFileSync(join(domain, "recovery-library.ts"), "utf8");
  const names = (t) =>
    [...t.matchAll(/^\s*n: "([^"]+)",\s*$/gm)].map((m) => m[1]);
  const recNames = [
    ...rec.matchAll(/n: "([^"]+)",\s*\n\s*dose:/g),
  ].map((m) => m[1]);
  return [...new Set([...names(ex), ...recNames])];
}

const all = movements();
const bySlug = new Map(all.map((n) => [slug(n), n]));

if (!existsSync(dir)) {
  console.error(`No ${dir} — nothing to ingest.`);
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png"));
const matched = [];
const unknown = [];
for (const f of files) {
  const s = f.replace(/\.png$/i, "");
  if (bySlug.has(s)) matched.push(s);
  else unknown.push(f);
}
const missing = [...bySlug.keys()].filter((s) => !matched.includes(s));

console.log(`${all.length} movements · ${matched.length} illustrated · ${missing.length} outstanding`);

if (unknown.length) {
  console.log("\nFilenames that match no movement — these would never be shown:");
  for (const f of unknown) {
    // Offer the nearest slug so a near-miss is obvious rather than mysterious.
    const stem = f.replace(/\.png$/i, "").replace(/[^a-z0-9]+/gi, "");
    const near = [...bySlug.keys()].find(
      (s) => s.replace(/-/g, "") === stem.toLowerCase(),
    );
    console.log(`  ${f}${near ? `   → did you mean ${near}.png ?` : ""}`);
  }
}

if (missing.length) {
  console.log("\nStill to draw:");
  for (const s of missing) console.log(`  ${s}.png   ${bySlug.get(s)}`);
}

if (!process.argv.includes("--write")) {
  console.log("\nRun again with --write to update CURATED in media.ts.");
  process.exit(unknown.length ? 1 : 0);
}

// ── Rewrite CURATED ─────────────────────────────────────────────────────────

const mediaPath = join(domain, "media.ts");
const media = readFileSync(mediaPath, "utf8");
const open = media.indexOf("export const CURATED = new Set<string>([");
const close = media.indexOf("]);", open);
if (open === -1 || close === -1) {
  console.error("Could not find the CURATED block in media.ts — not writing.");
  process.exit(1);
}

const body = matched.length
  ? matched
      .sort()
      .map((s) => `  ${JSON.stringify(s)},`)
      .join("\n")
  : "  // Populated as illustrations are generated and committed. Every entry\n" +
    "  // must have a matching file in web/public/movements/.";

const next =
  media.slice(0, open) +
  `export const CURATED = new Set<string>([\n${body}\n` +
  media.slice(close);

writeFileSync(mediaPath, next);
console.log(`\nWrote ${matched.length} slug(s) into CURATED.`);
if (unknown.length) process.exit(1);
