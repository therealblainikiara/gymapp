# C33 — the live browser pass

Milestones 6 and 7 rewrote Home, Workouts, Recovery, Diet and Progress, and
until this chunk **not one of those screens had ever been painted by a
browser**. Every `(app)` route sits behind the auth gate, the gate needs a live
Supabase project, and this container cannot reach one. So the generators were
covered by 344 unit tests and the rendering was covered by nothing.

Four defects came out of it that no test could have found, because each one is
only wrong on screen.

---

## The harness

`web/src/lib/preview.ts` — a flag with two independent locks:

1. `NODE_ENV !== "production"`, which `next build` sets, so a production bundle
   has the branch compiled out whatever the environment says.
2. `NEXT_PUBLIC_PREVIEW_HARNESS === "1"`, absent from `.env.local` and from
   `.env.example`, so it must be passed on the command line for one run.

When both hold, `proxy.ts` returns before the gate and `(app)/layout.tsx`
opens the local store against a fixed fake user id instead of calling
`getUser()`. Nothing else changes: the shell, the screens, the plan
generators and the IndexedDB cache under test are the real ones. A harness that
renders a copy of the UI proves nothing about the UI.

`provider.tsx` publishes the store as `window.__gym` under the same flag, so the
driver seeds a fixture through `patchProfile` — the same write the Settings
screen makes — rather than hand-building the IndexedDB schema a second time.

### Proof the locks hold

`src/lib/preview.test.ts` asserts the predicate directly, re-importing the
module under stubbed environments; the tests fail if either lock is weakened.
And the claim was checked against the real toolchain rather than only the unit
under test — a production build made **with** the variable set, served by
`next start` **with** it set again:

```
$ NEXT_PUBLIC_PREVIEW_HARNESS=1 npm run build && NEXT_PUBLIC_PREVIEW_HARNESS=1 npx next start
$ curl -o /dev/null -w '%{http_code} %{redirect_url}' localhost:3948/home
307 http://localhost:3948/sign-in?next=%2Fhome
```

The gate is untouched in production no matter what the environment says.

```
node scripts/preview-shots.mjs            # start dev, shoot 12 routes × 2 widths
node scripts/preview-shots.mjs --headed   # watch it happen
```

### The profile under test

47, perimenopausal, osteopenia, occasional leaking, an osteoarthritic knee,
hypertension, a knee injury, and **no clinician clearance** — deliberately the
hardest profile the app supports. Every M6 and M7 branch that only fires for a
declared condition fires for her.

**The first run was worthless and looked fine.** `patchProfile` opens with
`if (!this.db) return`, a silent no-op until `start()` has finished awaiting
`openLocalDb`; the provider publishes the store synchronously, so the seed was
aimed at a window where it was dropped without a word. Twenty-four clean
screenshots of the *default* profile. The script now waits for the store's
status to leave `loading` and then **asserts the fixture applied**, throwing if
it did not — a clean report about the wrong profile is worse than no report.

---

## Defects found and fixed

### 1. The same movement prescribed four times in one session — `blocking`

Monday's legs card read:

```
Glute bridge      4 × 6 · rest 120 s
Glute bridge      4 × 6 · rest 120 s
Glute bridge      4 × 6 · rest 120 s
Glute bridge      4 × 6 · rest 120 s
```

and Friday's core card alternated Dead bug / Bird dog / Dead bug / Bird dog.

`buildPlan` filled a day with `list[(offset + k) % list.length]` for `k < per`.
Once the filters shrank a group below the day's movement count, the index
wrapped and the same movement was pushed again. M6 made this common: a knee
injury plus `oa_knee` plus the pelvic-floor and blood-pressure removals leaves
the legs pool holding exactly one movement.

Every unit test passed throughout, and they were right to: a repeat is
correctly counted, correctly safe, and carries the correct scheme. Nothing in
the test suite asked whether the four rows were four *different* movements.

**Fixed** in `plan.ts`: a day's movements are now deduplicated, each pool is
walked at most once round, and a day left short is backfilled from the other
safe pools rather than padded with repeats. Two regression tests in
`plan.test.ts`; both fail if the dedupe is removed.

*Known consequence, and the honest version of the trade:* when the focus pool
really does hold one movement, the day is now three-quarters backfill while its
chip still reads `Legs`. That is a better session than four identical sets, and
it is still a label describing an intent the plan could not fully meet. Whether
the chip should say so is a copy decision, noted here rather than made.

### 2. The bottom tab bar rendered at every width — `fix-in-flight`

`globals.css` hides `.gym-tabs` above 920px and shows the side rail instead.
It never worked: `app-shell.tsx` set `display: "flex"` in the nav's **inline**
style, and an inline declaration cannot be overridden by a stylesheet. Every
desktop session has been showing two complete navigations at once, with a
redundant tab bar pinned across the bottom of the viewport.

**Fixed**: `display` moved out of the inline style into the `.gym-tabs` base
rule, where the media query can reach it.

### 3. A withheld movement still offered a set timer — `worth knowing`, safety-adjacent

`/train/dumbbell-romanian-deadlift` for this profile correctly leads with:

> **WITHHELD** — Not in your plan. You told us about pelvic floor symptoms, and
> this movement needs a braced breath hold under load. Ask your clinician before
> you add it back.

and then, further down the same page, offered **Target 4 × 6 · rest 120 s**,
a **Start set** button and **Do it live**. The app arguing with itself.

**Fixed**: the timer card is suppressed when a removal reason is present. The
cues, the joint-safe note and the variations stay — understanding a movement is
never gated, and C23/C24 already settled that guidance is ungated.

### 4. Home scrolled sideways on a 390px phone — `worth knowing`

392px of content in a 390px viewport. The offender was the session card:
`flex: "2 1 320px"` with the flex default `min-width: auto`, which refuses to
shrink below the content's minimum. It measured 369px inside a 354px column,
and the blueprint corner markers — which sit 5px outside their frame by design
— carried it past the viewport edge.

**Fixed**: `minWidth: 0` on that flex item.

### 5. No condensed fallback for Barlow Condensed — `worth knowing`

`industry.css` imports Barlow and Barlow Condensed from `fonts.googleapis.com`.
This container's proxy refuses that host, so **the whole pass rendered in the
fallback stack** — and the fallback was `system-ui, sans-serif`, which is not
condensed. Everything grew by roughly a fifth, and the seven bottom-tab labels
ran together into `RECOVERSOCIALPROGRESS`.

That is not only a container artefact. A blocked CDN, a privacy extension, an
enterprise proxy or a slow first paint all produce it for a real user, and the
layout is drawn to Barlow Condensed's metrics with nothing to catch it.

**Partly fixed**: `Roboto Condensed`, `Liberation Sans Narrow` and `Arial
Narrow` added ahead of the generic stack, and the tab labels' letter-spacing
tightened from 0.06em to 0.02em. This container has **no condensed face
installed at all** — `fc-list` offers DejaVu, Liberation Sans, FreeSans and
Noto and nothing narrow — so the fallbacks cannot help here and the phone
screenshots still show `RECOVER` touching `SOCIAL`. On a real device they do
help: Android has Roboto Condensed, Windows and macOS have Arial Narrow.

The residual is arithmetic, not a bug: seven labels, the longest eight
characters, across 390px gives each 55.7px, and `PROGRESS` needs about 63px at
11.5px in a normal-width face. Closing it means smaller type, fewer tabs or
shorter labels — all product decisions, so it is named in **C34** rather than
decided here.

### 6. Entrance animations ignored `prefers-reduced-motion` — `worth knowing`

No stylesheet in the app mentioned `prefers-reduced-motion`. Every card slid
and faded in on every navigation, staggered by index, whatever the user's
operating system had been told. The pass surfaced it as a symptom rather than
a search: a recovery card was captured still half-transparent because its
delayed entrance had not finished.

**Fixed**: a `@media (prefers-reduced-motion: reduce)` block in `globals.css`
disabling animations, transitions and smooth scrolling. The breathing orb is
excluded by class — it is not decoration, it is the pace the user is breathing
to, and stopping it would remove the feature rather than calm it.

---

## Reported, not fixed — these are design decisions

Both need someone's eye on the design system rather than a unilateral
restyle, so they are chunks in `docs/ECC-PLAN.md` rather than edits here.

### Type at 9–11px, throughout — for an over-40s app

93 distinct elements measured under 12px. `.card-kicker` is 10px,
`.card-meta` and the `.tag` variants are 11px, and Home's week strip labels
(`REST`, `TRAIN`) are **9px**. This is the Industry design system's own scale,
faithfully ported — and presbyopia is near-universal by 45, which is the middle
of this app's stated audience. Worth a deliberate decision, in either
direction, rather than an inherited default.

### Tap targets at 21px — below WCAG 2.2 AA

`a.gym-rowbtn` — the movement rows on `/recover` and the exercise rows on
`/train`, i.e. the app's primary tap targets — measure **320 × 21** and
**309 × 21**. WCAG 2.2 AA (2.5.8) requires 24 × 24; AAA (2.5.5) asks for
44 × 44. Several `btn-ghost` buttons come in at 20–23px tall. A fix is one
`min-height`, but it changes list density on every screen.

### The bottom tab bar, when no condensed face is available

See finding 5. Seven labels do not fit 390px at 11.5px in a normal-width face,
and no amount of letter-spacing closes a 7px-per-label gap. Belongs with C34
because the honest fixes are all the same decision: type size, tab count, or
copy.

---

## What this pass could not check

- **Real fonts.** Every measurement above was taken in a fallback face. The
  overflow and collision findings are therefore upper bounds; the font-size
  findings are exact, because `font-size` does not depend on which face loads.
- **Anything requiring a live session.** Sign-in, the disclaimer gate, the
  intake wizard, sync, the outbox, the coach route, and `/social`'s server
  queries all render, but against a store that is pinned offline. The harness
  removes the gate; it does not fake a session.
- **`/live`.** The camera screen needs `getUserMedia`, which this container has
  no device for.
- **Media.** `commons.wikimedia.org` is refused here, so every exercise detail
  page fell back to "no demonstration image found" — the correct behaviour for
  a failed lookup, and not evidence about the lookup itself. C1 still needs its
  live run.
- **Interaction.** This is a rendering pass. Nothing was clicked, no form was
  submitted, no timer was started. The report says a button is 21px tall; it
  does not say what happens when you press it.

## Reading the artifacts

`docs/preview/README.md` is regenerated by every run and holds the current
finding list; the screenshots sit beside it, `<route>.<viewport>.png`. The
script exits 1 while any finding stands, so it is usable as a check.
