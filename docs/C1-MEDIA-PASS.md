# C1 — the media pass

What the demonstration-media lookup does, which movements it is allowed to
search for, and what is still outstanding.

## The surface grew and nobody tracked it

C1 was written as "verify across all 28 exercises". That number is now wrong:

| Source | Movements searched | Added by |
|---|---|---|
| `EXERCISE_DB` | 28 | the original library |
| `BONE_LOADING` | 2 | M6 / C21 |
| `RECOVERY_LIBRARY` minus drainage and breath | 16 | M7 / C28, given detail pages by C29 |
| **Total** | **46** | |

Thirty-one of those had no override and had never been looked at. A test now
enumerates all three sources and fails when a movement appears without an
entry, so the next chunk that adds one cannot add it silently.

## The defect this pass found

`relevanceKeywords` keeps words longer than three characters and drops the
rest — but only *after* it has found at least one long word to keep. When the
discriminating word in a name is short and a generic word is long, the
discriminating word is the one that goes:

| Movement | Keywords actually used | What passes the filter |
|---|---|---|
| `Bird dog` | `bird` — "dog" dropped | any bird photograph |
| `Dead bug` | `dead` — "bug" dropped | anything with "dead" in the title |
| `Hip circles` | `circles` — "hip" dropped | crop circles, stone circles |
| `One-arm dumbbell row` | `dumbbell` — "row" dropped | any dumbbell |
| `Child's pose` | `child`, `pose` | **photographs of children** |

This is the same failure that produced the mass-casualty photo for "step up" in
Milestone 1, and the junk-domain blocklist cannot enumerate its way out: there
is no list of "things that are not a bird".

**The filter was not changed.** Switching the match from *any keyword* to *all
keywords* would fix it in principle and would also have broken at least two of
the five matches a human verified in M1 — the CDC step-up GIF and the bench
press both resolve on titles that do not contain every query word. Making that
change without being able to re-run the verification would be trading a known
failure for an unmeasured one.

Instead, the movements whose names cannot be searched safely are **not
searched**. `MEDIA_TERMS` now accepts `null`, meaning "never query this", and
the detail pages honour it. That is the mechanism C29 already applies wholesale
to drainage and breath movements, and it lands on the module's own stated
position: an honest "no demonstration found" beats a stranger's photograph
labelled as a squat.

`Child's pose` is skipped on firmer grounds than the rest. A fitness app must
not run an image search that can return photographs of children, and no
override fixes that while the filter is matching on the word itself.

## What is searched now

- **10 curated overrides** carried over from M1, unchanged.
- **10 new overrides** for recovery movements, chosen so the surviving keywords
  discriminate — `Chin tuck` searches "cervical retraction posture", not "chin".
- **10 movements skipped outright**: `Heel drop`, `Stamping march`, `Bird dog`,
  `Dead bug`, `Cat–cow`, `Hip circles`, `Wall angel`, `Legs up the wall`,
  `Figure-4 stretch`, `Child's pose`.
- **JUNK widened** with the civilian collisions the new names invite: parade,
  marching band, cemetery, funeral, protest, riot, weapon, firearm.

## Still outstanding — the pass itself

`scripts/media-audit.mjs` runs the real lookup against all 46 movements and
writes the report C1's accept criterion asks for:

```
node scripts/media-audit.mjs --out docs/C1-MEDIA-REPORT.md
```

**It has not been run.** `commons.wikimedia.org` is refused by this
environment's network policy — `403` on CONNECT, confirmed against the agent
proxy's own status endpoint, not a timeout. The script exits `2` and writes
nothing rather than producing a report in which every refused request appears
as an honest fallback. That distinction was a real bug in the first version of
the script, and it is the kind that turns an evidence document into a
comfortable fiction.

So C1 is **not closed**. What is done:

- the coverage gap is found, measured and fixed
- the unsafe queries are stopped
- the offline half is enforced on every commit by `media.test.ts`
- the online half is one command, on a machine that can reach Commons

What remains is running that command and having a person look at each IMAGE and
VIDEO row. The filter proves relevance by title, and a title can lie — which is
the whole reason C17 eventually replaces this heuristic layer with a curated
library.
