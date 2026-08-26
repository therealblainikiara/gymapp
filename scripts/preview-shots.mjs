#!/usr/bin/env node
/**
 * C33 — render every signed-in screen in a real browser and report what breaks.
 *
 * Milestones 6 and 7 rewrote Home, Workouts, Recovery, Diet and Progress, and
 * not one of those screens had ever been painted by a browser: they sit behind
 * the auth gate, the gate needs Supabase, and Supabase is not reachable from
 * the build container. Tests covered the generators; nothing covered the
 * rendering. This closes that.
 *
 *   node scripts/preview-shots.mjs                    # start dev, shoot, report
 *   node scripts/preview-shots.mjs --base http://…    # against a running server
 *   node scripts/preview-shots.mjs --headed           # watch it happen
 *
 * How it renders a gated screen: `web/src/lib/preview.ts` documents the two
 * locks. In short, `NEXT_PUBLIC_PREVIEW_HARNESS=1` under a non-production
 * NODE_ENV skips the gate and opens the local store against a fixed fake user.
 * Everything below that — the shell, the screens, the plan generators, the
 * IndexedDB cache — is the real thing.
 *
 * What it looks for, beyond "does it paint":
 *
 *   · uncaught exceptions and console errors, per route
 *   · horizontal overflow at phone width, which is the failure this design
 *     system is most prone to (fixed-width blueprint cards in a grid)
 *   · any single element wider than the viewport, named, so the offender is
 *     identified rather than just the symptom
 *   · text at or below 12px, which an over-40s app cannot afford
 *   · tap targets under 44px on the phone pass
 *   · empty <main>, i.e. a route that resolved but rendered nothing
 *
 * The screenshots are the secondary artifact. The report is the point.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "web");

// playwright-core is a devDependency of the app, not of the repo root — this
// script lives beside the other tooling but resolves from where the package
// actually is.
const { chromium } = createRequire(join(web, "package.json"))("playwright-core");
const shots = join(root, "docs/preview");

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const headed = argv.includes("--headed");

/**
 * The environment note says Chromium is pre-installed and Playwright is
 * configured to find it — but the installed `playwright-core` is newer than
 * the pinned browser build, so the automatic lookup misses by a version and
 * asks you to download one. The note's own remedy is an explicit path.
 */
const CHROME =
  process.env.PREVIEW_CHROME ??
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const PREVIEW_USER_ID = "00000000-0000-4000-8000-000000f12700";

// ── The fixture ─────────────────────────────────────────────────────────────

/**
 * Deliberately the hardest profile the app supports, not the easiest.
 *
 * 47, perimenopausal, osteopenia, occasional leaking, osteoarthritic knee and
 * hypertension, with no clinician clearance. Every M6 and M7 code path that
 * only fires for a declared condition fires for her: movements are removed
 * from the plan, recovery movements are swapped for alternatives, reasons are
 * printed beside both, micronutrient cards appear on Diet, the flush stepper
 * appears on Home, and the bone-loading block is *blocked* rather than added.
 *
 * A default profile would render every screen in its blandest state and prove
 * nothing about the two milestones that have never been seen.
 */
const PROFILE = {
  display_name: "Preview",
  handle: "preview",
  goal: "strength",
  muscles: ["legs", "back", "core"],
  level: "intermediate",
  kit: "dbbw",
  session_len: 30,
  avail_days: [1, 3, 5],
  pref_time: "morning",
  dietary: [],
  injuries: ["knee"],
  height_cm: 166,
  age: 47,
  sex: "female",
  menopause_stage: "peri",
  bone_health: "osteopenia",
  pelvic_floor: "occasional",
  conditions: ["oa_knee", "hypertension"],
  clinician_cleared_at: null,
  disclaimer_accepted_at: "2026-01-01T00:00:00.000Z",
  disclaimer_version: 1,
  intake_completed_at: "2026-01-01T00:00:00.000Z",
};

/** Twelve weeks of history, so the charts have something to draw. */
function history(userId) {
  const days = [];
  const now = new Date();
  for (let back = 84; back >= 0; back -= 7) {
    const d = new Date(now);
    d.setDate(d.getDate() - back);
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`,
    );
  }
  const weights = days.map((date, i) => ({
    user_id: userId,
    date,
    kg: Math.round((78 - i * 0.35) * 10) / 10,
    source: "manual",
    waist_cm: 88 - i * 0.4,
    // Only measured at the ends, which is how a function test is actually
    // used — and it exercises the sparse-series path rather than a dense one.
    grip_kg: i === 0 ? 24 : i === days.length - 1 ? 27 : null,
    sit_to_stand: i === 0 ? 11 : i === days.length - 1 ? 14 : null,
    balance_sec: i === 0 ? 9 : i === days.length - 1 ? 16 : null,
  }));
  const events = days.flatMap((date, i) => [
    {
      id: `preview-w-${i}`,
      user_id: userId,
      date,
      type: "Workout",
      minutes: 32,
      avg_hr: 121,
      distance_km: null,
      source: "manual",
      external_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: `preview-m-${i}`,
      user_id: userId,
      date,
      type: "Mobility",
      minutes: 12,
      avg_hr: null,
      distance_km: null,
      source: "manual",
      external_id: null,
      created_at: new Date().toISOString(),
    },
  ]);
  const checkins = days.slice(-3).map((date) => ({
    user_id: userId,
    date,
    // Sleep 2 trips the autoregulation path on Home (POOR_SLEEP).
    sleep: date === days[days.length - 1] ? 2 : 4,
    stress: 3,
    energy: 3,
    flushes: 4,
    mood: 3,
  }));
  return { weights, events, checkins };
}

// ── Routes ──────────────────────────────────────────────────────────────────

const ROUTES = [
  ["home", "/home"],
  ["train", "/train"],
  ["train-kept", "/train/goblet-squat"],
  // Withheld for osteopenia: the detail page must lead with why, not with a
  // set timer for a movement that is not in the plan.
  ["train-withheld", "/train/dumbbell-romanian-deadlift"],
  ["recover", "/recover"],
  ["recover-move", "/recover/figure-4-stretch?dose=30%20s%20%2F%20side"],
  // Contraindicated for the pelvic floor declaration, so the detail page has
  // to show the swap rather than the movement.
  ["recover-swapped", "/recover/child-s-pose?dose=60%20s"],
  ["recover-session", "/recover/cat-cow?dose=8%20reps&day=0&i=0"],
  ["diet", "/diet"],
  ["progress", "/progress"],
  ["setup", "/setup"],
  ["social", "/social"],
];

/**
 * Hosts this container's egress proxy refuses. Their failures say nothing
 * about the app — but they do change what the screenshots show, so they are
 * reported under their own heading rather than dropped.
 */
const BLOCKED_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "supabase.co",
  "commons.wikimedia.org",
];

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];

// ── Dev server ──────────────────────────────────────────────────────────────

async function waitFor(url, ms = 120_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function startDev() {
  const port = arg("--port", "3947");
  const child = spawn(
    "npx",
    ["next", "dev", "--port", port, "--hostname", "127.0.0.1"],
    {
      cwd: web,
      env: {
        ...process.env,
        NEXT_PUBLIC_PREVIEW_HARNESS: "1",
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
      // Its own process group. `next dev` forks a server child, and signalling
      // only the npx wrapper leaves that child holding the port — the next run
      // then quietly attaches to a *stale build* of the app.
      detached: true,
    },
  );
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
  const log = [];
  child.stdout.on("data", (d) => log.push(String(d)));
  child.stderr.on("data", (d) => log.push(String(d)));
  const base = `http://127.0.0.1:${port}`;
  if (!(await waitFor(base + "/home"))) {
    stop();
    console.error("Dev server never came up:\n" + log.join(""));
    process.exit(2);
  }
  return { base, stop, log };
}

// ── In-page checks ──────────────────────────────────────────────────────────

/**
 * Run inside the page. Returns findings, not a verdict — every threshold here
 * is a judgement call and the report shows the measurement so it can be argued
 * with.
 */
const AUDIT = () => {
  const vw = document.documentElement.clientWidth;
  const out = {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: vw,
    overflowing: [],
    tinyText: [],
    smallTargets: [],
    mainText: 0,
    mainChildren: 0,
  };
  const main = document.querySelector("main");
  if (main) {
    out.mainText = (main.innerText || "").trim().length;
    out.mainChildren = main.children.length;
  }
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
    const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` — "${text}"` : ""}`;
  };
  for (const el of document.querySelectorAll("main *, header *, nav *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // 1px of tolerance: sub-pixel layout rounds past the edge harmlessly.
    if (r.right > vw + 1 || r.left < -1) {
      out.overflowing.push({
        el: describe(el),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const own = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim(),
    );
    if (own && size && size < 12) {
      out.tinyText.push({ el: describe(el), px: Math.round(size * 10) / 10 });
    }
    if (
      (el.tagName === "BUTTON" || el.tagName === "A") &&
      (r.height < 32 || r.width < 32) &&
      (el.innerText || "").trim()
    ) {
      out.smallTargets.push({
        el: describe(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }
  // One entry per offending element is enough to act on; a deep tree reports
  // the same overflow once per ancestor otherwise.
  const uniq = (a, k) => {
    const seen = new Set();
    return a.filter((x) => !seen.has(x[k]) && seen.add(x[k]));
  };
  out.overflowing = uniq(out.overflowing, "el").slice(0, 12);
  out.tinyText = uniq(out.tinyText, "el").slice(0, 12);
  out.smallTargets = uniq(out.smallTargets, "el").slice(0, 12);
  return out;
};

// ── Run ─────────────────────────────────────────────────────────────────────

const server = arg("--base", null)
  ? { base: arg("--base", null), stop: () => {} }
  : await startDev();

rmSync(shots, { recursive: true, force: true });
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  headless: !headed,
  executablePath: CHROME,
});

const findings = [];
const record = (route, viewport, kind, detail) =>
  findings.push({ route, viewport, kind, detail });

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    reducedMotion: "reduce",
  });

  /**
   * The store only syncs when `navigator.onLine` is true, so pinning it false
   * means no request is ever aimed at the Supabase project this harness does
   * not have. The alternative — letting every page spend its load budget on
   * DNS failures — would put a sync-error banner in every screenshot and time
   * the pages out.
   */
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { get: () => false });
  });
  // Belt and braces: if anything reaches for the network anyway, that is a
  // finding, not something to let hang.
  await context.route("**://*.supabase.co/**", (r) => r.abort());

  const page = await context.newPage();

  // Seed once per context. `patchProfile` is the store's own write path;
  // the history goes in as rows on the database the store has already
  // created, so nothing here duplicates the schema in lib/local/db.ts.
  await page.goto(`${server.base}/home`, { waitUntil: "domcontentloaded" });
  /**
   * Wait for the store to be *open*, not merely to exist.
   *
   * `patchProfile` opens with `if (!this.db) return` — a silent no-op until
   * `start()` has finished awaiting `openLocalDb`. The provider publishes the
   * store synchronously in an effect, so `window.__gym` appears first and a
   * patch aimed at that window is dropped without a word. The first run of this
   * script did exactly that: twenty-four screenshots of the default profile,
   * every one of them looking fine, proving nothing about the conditional
   * branches the pass exists to look at. `status` leaves "loading" only after
   * the database is assigned, so it is the honest signal.
   */
  await page.waitForFunction(
    () => !!window.__gym && window.__gym.getSnapshot().status !== "loading",
    null,
    { timeout: 30_000 },
  );
  await page.evaluate((p) => window.__gym.patchProfile(p), PROFILE);
  // And prove it landed. A fixture that fails to apply is worse than no
  // fixture: it produces a clean report about a screen nobody asked for.
  const applied = await page.evaluate(() => {
    const p = window.__gym.getSnapshot().profile;
    return p && { age: p.age, goal: p.goal, stage: p.menopause_stage };
  });
  if (
    !applied ||
    applied.age !== PROFILE.age ||
    applied.goal !== PROFILE.goal ||
    applied.stage !== PROFILE.menopause_stage
  ) {
    throw new Error(
      `Fixture profile did not apply: ${JSON.stringify(applied)}. ` +
        "Every finding below would have described the default profile.",
    );
  }
  await page.evaluate(
    async ({ uid, rows }) => {
      const db = await new Promise((res, rej) => {
        const rq = indexedDB.open(`gymapp:${uid}`);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
      for (const [store, list] of Object.entries(rows)) {
        await new Promise((res, rej) => {
          const tx = db.transaction(store, "readwrite");
          for (const row of list) tx.objectStore(store).put(row);
          tx.oncomplete = res;
          tx.onerror = () => rej(tx.error);
        });
      }
      db.close();
    },
    { uid: PREVIEW_USER_ID, rows: history(PREVIEW_USER_ID) },
  );

  for (const [name, path] of ROUTES) {
    const errors = [];
    const onConsole = (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    };
    const onPageError = (e) => errors.push(`uncaught: ${e.message}`);
    const onFailed = (r) =>
      errors.push(`request failed: ${r.url()} — ${r.failure()?.errorText}`);
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("requestfailed", onFailed);

    let status = null;
    try {
      const res = await page.goto(`${server.base}${path}`, {
        waitUntil: "networkidle",
        timeout: 45_000,
      });
      status = res?.status() ?? null;
    } catch (e) {
      record(name, vp.name, "navigation", e.message);
    }
    // Let the store's first cache read land and the fade-up settle.
    await page.waitForTimeout(700);

    if (status && status >= 400) {
      record(name, vp.name, "http", `HTTP ${status} for ${path}`);
    }

    let audit = null;
    try {
      audit = await page.evaluate(AUDIT);
    } catch (e) {
      record(name, vp.name, "audit", e.message);
    }

    if (audit) {
      if (audit.scrollWidth > audit.clientWidth + 1) {
        record(
          name,
          vp.name,
          "horizontal-scroll",
          `page scrolls sideways: ${audit.scrollWidth}px of content in ${audit.clientWidth}px`,
        );
      }
      for (const o of audit.overflowing) {
        record(
          name,
          vp.name,
          "overflow",
          `${o.el} spans ${o.left}→${o.right} (viewport 0→${audit.clientWidth})`,
        );
      }
      for (const t of audit.tinyText) {
        record(name, vp.name, "tiny-text", `${t.px}px — ${t.el}`);
      }
      for (const t of audit.smallTargets) {
        record(name, vp.name, "small-target", `${t.w}×${t.h} — ${t.el}`);
      }
      if (audit.mainChildren === 0 || audit.mainText < 20) {
        record(
          name,
          vp.name,
          "empty",
          `<main> rendered ${audit.mainChildren} children / ${audit.mainText} chars of text`,
        );
      }
    }

    for (const e of errors) {
      // The container's proxy refuses these three, so their failures are facts
      // about this machine, not about the app. Kept and labelled rather than
      // filtered: fonts.googleapis.com being unreachable is precisely why the
      // screenshots are not in Barlow, and a reader has to be told that.
      const blocked = BLOCKED_HOSTS.find((h) => e.includes(h));
      record(name, vp.name, blocked ? "blocked-host" : "js", e);
    }

    await page.screenshot({
      path: join(shots, `${name}.${vp.name}.png`),
      fullPage: true,
    });

    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onFailed);
    process.stdout.write(
      `  ${vp.name.padEnd(7)} ${path.padEnd(46)} ${
        findings.filter((f) => f.route === name && f.viewport === vp.name)
          .length || "ok"
      }\n`,
    );
  }

  await context.close();
}

await browser.close();
server.stop();

// ── Report ──────────────────────────────────────────────────────────────────

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);

/**
 * `tiny-text` and `small-target` are properties of the design system, not of
 * any one route — the same `.card-meta` at 11px is reported by every screen
 * that uses it. Listing each occurrence turns four decisions into four hundred
 * lines and buries the one-off defects. They are collapsed by what was
 * measured, with the routes that show it.
 */
const SYSTEMIC = new Set(["tiny-text", "small-target"]);

function collapse(list) {
  const groups = new Map();
  for (const f of list) {
    // Everything after the em dash is the element description; the measurement
    // in front of it is what makes two occurrences the same finding.
    const key = f.detail;
    const g = groups.get(key) ?? { detail: key, routes: new Set() };
    g.routes.add(`${f.route}/${f.viewport}`);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.routes.size - a.routes.size);
}

const lines = [
  "# C33 — live browser pass",
  "",
  `${ROUTES.length} routes × ${VIEWPORTS.length} viewports, rendered by Chromium`,
  "through `scripts/preview-shots.mjs`. Screenshots are beside this file.",
  "",
  "The profile under test is 47, perimenopausal, with osteopenia, occasional",
  "leaking, an osteoarthritic knee and hypertension, and no clinician",
  "clearance — the profile that makes every M6 and M7 branch fire. The script",
  "refuses to run if that profile fails to apply, because a clean report about",
  "the default profile is worse than no report.",
  "",
  `## ${findings.length} finding(s)`,
  "",
];
if (!findings.length) {
  lines.push("Every route rendered with no uncaught error, no console error,");
  lines.push("no sideways scroll and no empty main.", "");
} else {
  for (const [kind, list] of Object.entries(byKind)) {
    if (SYSTEMIC.has(kind)) {
      const groups = collapse(list);
      lines.push(
        `### ${kind} — ${list.length} occurrence(s), ${groups.length} distinct`,
        "",
      );
      for (const g of groups) {
        const routes = [...g.routes];
        lines.push(
          `- ${g.detail}\n  — on ${routes.length} screen(s): ${routes
            .slice(0, 6)
            .join(", ")}${routes.length > 6 ? ", …" : ""}`,
        );
      }
      lines.push("");
      continue;
    }
    lines.push(`### ${kind} — ${list.length}`, "");
    for (const f of list) {
      lines.push(`- \`${f.route}\` (${f.viewport}) — ${f.detail}`);
    }
    lines.push("");
  }
}
lines.push("## Screenshots", "");
for (const [name, path] of ROUTES) {
  lines.push(
    `- \`${name}\` — \`${path}\` — ![phone](${name}.phone.png) ![desktop](${name}.desktop.png)`,
  );
}
lines.push("");

const out = lines.join("\n");
writeFileSync(join(shots, "README.md"), out);
console.log("\n" + out);
process.exitCode = findings.length ? 1 : 0;
