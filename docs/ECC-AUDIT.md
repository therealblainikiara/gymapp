# ECC-AUDIT — Gym App, 2026-08-24

Evidence behind `docs/ECC-PLAN.md`. Supersedes `project/docs/ECC-AUDIT.md`,
which audited the prototype before the app existed and is kept unmodified as
part of the Claude Design export bundle.

Repo state at audit time: branch `main`, clean tree, level with `origin/main`,
HEAD `4cb7f59`. 163 tests pass, `tsc --noEmit` clean, `eslint src` clean,
`next build` clean.

---

## 1. Documents

| Document | Last touched | Claims | Code agrees? |
|---|---|---|---|
| `README.md` | design export | Describes the Claude Design bundle | n/a — describes `project/`, not `web/` |
| `project/docs/ECC-PLAN.md` | pre-M2 | 6 milestones, C1–C26 | Partly — M6 lines are stale, see §2 |
| `project/docs/ECC-AUDIT.md` | pre-M2 | Prototype audit | Superseded by this file |
| `project/docs/M2-BACKEND-HANDOFF.md` | pre-M2 | The M2 spec | Yes — implemented, see `docs/M2-IMPLEMENTATION.md` |
| `docs/M2-IMPLEMENTATION.md` | 2026-08-23 | What C6–C9 built | Yes, spot-checked |
| `docs/M2-SCHEMA-CHANGELOG.md` | 2026-08-23 | Migration history | Stale — missing `gymapp_condition_profile` |
| `docs/M2-SETUP.md` | 2026-08-23 | Supabase setup steps | Yes; several steps still outstanding on the live project |
| `docs/M2-DEPLOY.md` | 2026-08-23 | Vercel + push-to-main | Yes |
| `docs/M6-CONDITION-AWARE-PLAN.md` | 2026-08-24 | C19–C26 | Yes — updated with C20 this session |
| `web/AGENTS.md` | generated | Next.js 16 has breaking changes; read the bundled docs | Yes, and it is re-added by `next dev` |

**Two doc trees.** `project/docs/` is the Claude Design export (design bundle,
chats, original plan). `docs/` is the working documentation. Deliberate, but
undocumented until now, and it produced the broken reference in §2.

## 2. Conflicts

**C-1 — `docs/M6-CONDITION-AWARE-PLAN.md:3` points at a file that does not
exist.** It reads "Extends `docs/ECC-PLAN.md`"; the file was at
`project/docs/ECC-PLAN.md`. Five source comments (`web/src/lib/disclaimer.ts:12`,
`web/src/app/robots.ts:8`, `web/src/lib/domain/media.ts:12`,
`web/src/lib/domain/buddy.ts:6`, `web/src/components/fitness-buddy.tsx:9`) also
cite bare `ECC-PLAN.md`. *Resolution:* this run writes `docs/ECC-PLAN.md`, which
makes every one of those references resolve. Doc conflict, closed.

**C-2 — `project/docs/ECC-PLAN.md:50` says C19's schema is "not yet applied".**
It was applied to the hosted project this session as `gymapp_condition_profile`,
verified by querying `gymapp.profiles` for the five new columns. *Resolution:*
code wins; the superseding plan records C19 and C20 as done.

**C-3 — `docs/M2-SCHEMA-CHANGELOG.md` stops at the `to authenticated`
migration.** Three later migrations are missing from it: the profile backfill,
the condition profile, and (pending) the mobility event type. *Resolution:*
doc correction, filed as W1 in the plan.

**C-4 — doc vs doc-implied-scope, and the reason this run happened.**
`project/docs/ECC-PLAN.md:6` states goal 1 as "workouts/diet/recovery/progress",
four peers. `docs/M6-CONDITION-AWARE-PLAN.md` allots recovery one line — C23,
"content plus conditional rendering — no generator changes". Those imply very
different amounts of work, and the second one is what got built. *Resolution:*
the first is right. Milestone 7 in the plan.

## 3. Completion audit

Scores are against observable anchors: exists / wired / failure paths / covered
by a test or a named manual check / free of stubs.

### Verified complete

| Chunk | Evidence |
|---|---|
| C3 Mifflin-St Jeor targets | `lib/domain/nutrition.ts` + 114-line test file |
| C4 Archive old prototypes | `project/archive/` holds v1, Home A, Home B; v2 is the sole entry |
| C6 Data model + RLS | 4 applied migrations; `supabase/tests/01_rls.sql` asserts policy behaviour and the `search_profiles` 3-column projection |
| C7 Auth + disclaimer record | `proxy.ts` gate uses `getUser()`; `disclaimer_accepted_at` timestamped; password + magic link both live, both exercised against the hosted project this session |
| C8 Local-first sync | IndexedDB store, outbox with coalescing, LWW-by-`updated_at` on profiles with an `.lte()` guard; `outbox` and `legacy` test files |
| C9 Port screens 1:1 | 13 routes; Industry tokens throughout |
| C19 Health declarations | Migration applied and verified live; intake step, Setup section, clinician gate; `conditions.test.ts` |
| C20 Contraindication metadata | `MovementFlag` on 12 movements; `safe()` extended; 450-plan sweep in `plan.test.ts`, mutation-verified |

### Demoted from "complete"

**C1 — image pipeline, claimed done, scored 70%.** `lib/domain/media.ts` does a
live Wikimedia Commons lookup with an honest empty state, and `media.test.ts`
covers it. The claim was "verify across all 28 exercises; curate overrides where
API results are poor" — there are 28 exercises (`exercises.ts`), but no override
map exists and no record of the per-exercise verification. The mechanism is
done; the curation pass is not.

**C2 — coach feedback, claimed done, scored 85%.** `/api/coach` is real, behind
a `CoachProvider` interface, with `CAM_TIPS` as the fallback
(`live-camera.tsx:106`). Not verified end-to-end against a rate-limited key, and
the API-key story is explicitly unresolved — noted in the plan as an open
decision from an earlier session, not a bug.

### Scored

| Chunk | Score | Working |
|---|---|---|
| C5 Legal review | 0% | External counsel. Widened by M6 naming medical conditions. Nothing an agent can close. |
| C10 Partner search | 80% | `search_profiles` RPC exists and is projection-tested; `social/page.tsx` (566 lines) queries friendships. No two-account manual check recorded. |
| C11 Challenge engine | 40% | `challenges` table, `weekly_active_minutes` view and the leaderboard render. The Sunday cron that seeds each week's row does not exist — `social/page.tsx:25` says so. |
| C12 Activity feed | 70% | Events render; no pagination, no friend-event feed. |
| C13–C15 Devices | 5% | `DEVICES` is a 4-entry list and pairing is a 1400 ms `setTimeout` (`setup/page.tsx:27`). Screen copy says so out loud. |
| C16 Buddy | 10% | Still the CSS figure. `fitness-buddy.tsx:9` states it. |
| C17 Real media | 30% | Commons lookup only; nothing licensed or shot. |
| C18 Pose analysis | 15% | Real webcam and MediaRecorder; reps and HR simulated at a fixed 2800 ms cadence (`live-camera.tsx:21`). Copy discloses it. |
| C21–C26 | 0% | Not started. |

## 4. Issues in current code

**I-1 · blocking · Recovery prescribes the movements C20 removes.**
`lib/domain/recovery.ts` is unfiltered by anything — not equipment, not
injuries, not health declarations. Two commits ago I shipped an exhaustively
tested guarantee that no plan reaches a user with `bone_health = 'osteoporosis'`
containing loaded spinal flexion or end-range rotation. The Recovery screen then
serves that same user:

- `recovery.ts:35` — "Child's pose 90 s" (loaded spinal flexion)
- `recovery.ts:36` — "Supine twist 60 s / side" (end-range spinal rotation)
- `recovery.ts:17` — "Standing hamstring reach × 8" (a toe-touch)
- `recovery.ts:16` — "World's greatest stretch" (deep lunge with rotation)
- `recovery.ts:26` — "Thoracic rotations × 8 / side"

Every one of the three routines contains at least one. *Trigger:* any user who
declares osteoporosis and opens `/recover`. A filter that covers one screen and
not its neighbour is worse than no filter, because it manufactures trust the
product has not earned.

**I-2 · blocking · Mobility milestones tell users to do the withheld movement.**
`recovery.ts:51` sets "Touch toes with soft knees" and `recovery.ts:52`
"Full-depth goblet squat" as achievements to tick off at
`progress/page.tsx:275`. The first is the fracture mechanism for osteoporosis;
the second is what C21's OA-knee rule is specified to cap. This is not an
omission — it is the app actively coaching toward a contraindication. Same
trigger as I-1.

**I-3 · fix-in-flight · `recovery.ts` has no test file.** Nine of the ten domain
modules are covered; this one is not, and it is the one shipping medical-adjacent
prescriptions.

**I-4 · fix-in-flight · Recovery is not reachable in depth.** There is no
`/recover/[slug]`. Stretch steps are bare strings, so no cue, no over-40 safety
note, no easier/harder variation, no demo — all of which every one of the 28
exercises has. `recover-screen.tsx` is 227 lines against Train's 186 + a
297-line detail page.

**I-5 · worth knowing · Recovery content ignores the profile entirely.**
`recover-screen.tsx` reads `profile.avail_days.length` for one closing sentence
and nothing else. Session length, level, equipment, goal and every declaration
are unused, so a 10-minute beginner and a 60-minute advanced user get identical
routines.

**I-6 · worth knowing · A stretch session cannot be logged.** Workouts have
"Mark session done ✓"; the only loggable thing on `/recover` is the walk. The
`events.type` CHECK (`20260823000100_gymapp_init.sql:96`) has no mobility value.
This is the single clearest signal that recovery is treated as optional.

**I-7 · worth knowing · Live-project configuration is still outstanding.** From
earlier sessions and unchanged: the `service_role` key pasted into chat has not
been confirmed rotated; Site URL and redirect URLs still need to point at
`gymapp-two-phi.vercel.app`; `gymapp` needs adding to Exposed schemas; custom
SMTP is unconfigured, so magic links hit the shared rate limit.

## 5. Scaffold and boilerplate

Swept `web/` for `create-next-app` residue. Findings are thin, which is the
right outcome: no default favicon page, no example API route, no placeholder
metadata, no unused `public/` assets. Route names, manifest and robots are all
app-specific.

- `web/AGENTS.md` / `web/CLAUDE.md` — **keep as generated.** Written and
  re-added by `next dev`; committing it keeps the tree clean, which the file
  itself explains.
- `web/README.md` — **adapt.** Still the scaffold's text. Low priority, but it
  is the first file a new contributor opens.

## 6. Goals

Goal 1 — "workouts/diet/recovery/progress as a real app" — is testable and, on
the evidence above, three-quarters met. Recovery is the quarter that is not, and
nothing in the goal statement licensed treating it as a lesser peer. The gap was
invisible because both screens render and both look finished.

Goals 2–5 are testable and unmet, with honest disclosure in the UI in each case.

No goals contradict each other. The structure still fits.

## 7. Not verified

- **The osteoporosis filter has not been exercised by a human on the deployed
  site.** It is proven by a 450-plan sweep and a mutation check, both offline.
- **Nothing was run against the live database in this audit** beyond reading
  schema. No RLS policy was re-tested against the hosted project.
- **No browser check of any screen.** `next build` compiles all 20 routes; that
  is not the same as looking at them.
- **C10's two-account flow** — asserted by the RLS suite, never manually walked.
- **Whether the Wikimedia lookup returns anything useful for all 28 exercises**
  — the reason C1 is demoted rather than scored confidently.
- **The stretch content itself has had no clinical review.** I classified the
  movements above by mechanism from their own step text. That is enough to act
  on and not enough to publish behind; it is part of what C5 needs to cover.
