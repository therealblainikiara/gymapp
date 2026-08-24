# ECC-AUDIT — Gym App (prototype)

> **Superseded by `docs/ECC-AUDIT.md` (2026-08-24).** Kept unmodified as part of
> the Claude Design export bundle; it audited the prototype before the app existed.

Date: 2026-08-23 · Auditor: design session (cold-start audit of design prototype, not a git repo)

## Repo state
- No version control. Project is a browser design-prototype workspace. **Risk: no git — history lives only in this workspace.**
- Files: `Gym App v2.dc.html` (THE app, ~all logic + UI), `Gym App.dc.html` (v1, superseded), `Home A.dc.html` / `Home B.dc.html` (Home-screen candidates; B was chosen), `_ds/industry-*/` (bound Industry design system: styles.css + bundle), `support.js` (runtime, generated).
- User attached a local folder "GymAPP" as code source; user chose **fresh design** — folder was never mined. UNVERIFIED: its contents.

## What the product is (from brief + 8 rounds of intake answers)
Fitness app for **over-40s**: pick goal/muscles → tailored workout plan + meal ideas. Coach-like direct tone. Bodyweight + dumbbells default. Session lengths 10–60 min. Recovery focus: stretching, box breathing, lymphatic drainage, rest-day walks, sleep/stress check-ins. Adaptive nav (bottom tabs mobile / side rail desktop). Persistence between visits (localStorage). Sunday week start, kg/cm, auto rest days, streak counts check-ins. Camera "live workout" with self-view, rep counter, posture guide, record/review, coach feedback. Dietary **health requirements** (hard filters): vegetarian, lactose-, gluten-, nut-free. Liability disclaimer gate. 7-step intake questionnaire. Device linking: **Android (Health Connect) first**, iPhone (HealthKit) parallel; watch/scale via phone. Social: find users, weekly challenges, activity logging (walk/ride/run/swim/squash/tennis with min/HR/km). BMI + non-judgmental suggested weight range. 3D "fitness buddy" demonstrating movements. User directive: "nothing mocked — real APIs, real images."

## Completion table (evidence = feature verified working in preview by verifier agent unless noted)
| Feature | % | Evidence / gap |
|---|---|---|
| Disclaimer gate (accept-to-use, re-readable) | 100 | In v2; blocks app until accepted; persisted. Legal wording NOT lawyer-reviewed. |
| Intake wizard (7 steps: days, time, goal, focus+injuries, dietary, kit/level, devices) | 100 | Persisted; re-runnable from Settings. |
| Workout plan generation (goal×level×kit×length×days×injuries) | 100 | Injury-aware filtering with safe fallbacks; warm-up row; finishers. |
| Exercise detail (cues, 40+ safety notes, easier/harder, set timer) | 100 | Verified. |
| Real exercise images | 70 | wger endpoint 404'd; fixed with multi-endpoint + Wikimedia Commons fallback. **Not re-verified after fix** (verifier skipped). |
| Camera live mode (webcam, record/review, posture overlay) | 90 | Real getUserMedia + MediaRecorder. Rep counter is timer-based (simulated), labelled. |
| AI coach feedback (window.claude.complete on set end) | 90 | Real API call from real set stats. Not exercised end-to-end by verifier. |
| Diet (targets, meals, prep, grocery list, hydration, anti-inflam tags) | 100 | Hard dietary filters verified; all-requirement combos have compliant meals. |
| Recovery (breathing timer, lymph sequence, 3 stretch routines, walk) | 100 | Verified. |
| Progress (streak, sessions, weight log + sparkline, check-in trends, mobility) | 100 | Verified; persisted. |
| BMI + suggested weight range | 95 | Added last session, console-clean; not verifier-reviewed. |
| Fitness buddy | 60 | CSS-3D Mii-style figure, 5 movement patterns, auto-selected. User asked for Wii-Mii 3D character demoing ALL activities — a rigged three.js buddy (incl. stretches/recovery) is NOT built. |
| Social: activity logging + weekly challenge (150 active min) | 95 | Real local data; workouts log as events. Not verifier-reviewed. |
| Social: find users / leaderboard | 20 | UI exists; leaderboard shows only "You"; search returns honest "needs backend" row. **Cannot be real without accounts + server.** |
| Device linking (Android-first framing, simulated pairing, HR overlay, synced strip) | 40 | UI + simulated pairing only. Health Connect/HealthKit require a native app. |
| Persistence | 100 | localStorage key `gymapp_v2`; browser-only. **Not a long-term store** (user acknowledged). |

## Conflicts / tensions
1. **"Nothing mocked" vs browser prototype**: user search, leaderboards, phone health data physically require a backend + native app. Current honest-label approach is the resolution; plan makes them real via Supabase + Android app.
2. **v1 file vs v2**: `Gym App.dc.html` is superseded — archive or delete (decision needed).
3. **Days/week setting (v1)** replaced by explicit available-days; docs/old file still carry the old model.

## Issues (current code)
- fix-in-flight: exercise-image fetch fix unverified; Wikimedia results may be low-relevance for some terms.
- worth knowing: `toggleFriend` is a no-op; hrm→ios device key rename leaves stale `hrm` in old saves (harmless).
- worth knowing: kcal/macros are static per goal — not personalized to weight/height/BMR (data now exists to do it).
- worth knowing: disclaimer text needs real legal review before release.
- blocking (for release, not prototype): no backend, no accounts, no real device data.

## Not verified
- Claude coach call under rate limits; wger/Commons image quality across all 28 exercises; camera on iOS Safari; long-term localStorage size; GymAPP local folder contents.
