# Deploying — push to main goes live

Same trigger as `vice_grid`: every push to `main` publishes. Different target,
because this app is not static. `vice_grid` builds one self-contained HTML file
and GitHub Pages serves it. Gym App has server middleware (the disclaimer
gate), server routes (`/api/coach`, `/auth/callback`) and SSR that reads
cookies — Pages has no Node runtime to run any of it, so the gate and the coach
route would simply not exist.

Vercel runs Next.js natively and connects to GitHub directly, so there is no
deploy workflow to maintain. The CI in `.github/workflows/ci.yml` keeps running
alongside as the quality gate.

## One-time setup

### 1. Import the repo

[vercel.com/new](https://vercel.com/new) → import `therealblainikiara/gymapp`.

**Set Root Directory to `web`.** This is the one setting that will bite you:
the repo root holds `supabase/`, `docs/` and the design bundle, and the Next.js
app is one level down. Left at the default, the build fails with "No Next.js
version detected".

Everything else auto-detects — framework, build command, output.

### 2. Environment variables

Add these under Settings → Environment Variables, for **all three**
environments (Production, Preview, Development):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ytyaouylcbathwyodpvi.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` key |
| `ANTHROPIC_API_KEY` | *optional* — without it the camera screen falls back to its built-in coaching cues and nothing else changes |

There is no site-URL variable to set. Origins are derived from the request, so
production and every preview deployment work unchanged.

Do **not** add `SUPABASE_SECRET_KEY` — nothing in the app reads it. It is only
needed by the weekly-challenge job in M3.

### 3. Supabase redirect URLs

Dashboard → Authentication → URL Configuration. Magic links fail silently
without this.

- **Site URL:** `https://<your-project>.vercel.app`
- **Redirect URLs** — add all three:
  ```
  http://localhost:3000/auth/callback
  https://<your-project>.vercel.app/auth/callback
  https://<your-project>-*.vercel.app/auth/callback
  ```

The third line is the one people miss. Every preview deployment gets its own
hostname, so without a wildcard entry, sign-in works in production and fails on
every PR preview.

### 4. Custom domain (optional)

Add it in Vercel, then add `https://<domain>/auth/callback` to the Supabase
redirect list and update the Site URL to match.

## What happens on each push

| Event | Result |
|---|---|
| Push to `main` | CI runs; Vercel publishes to the production URL |
| Open a PR | CI runs; Vercel publishes a preview URL and comments it on the PR |
| CI fails | The Vercel deploy still goes out — they are independent. If you want a red build to block the deploy, turn on Vercel's "Only deploy when checks pass" |

## While this is the demo

The deployed site points at the same Supabase project as your squash and
songwriting apps, in its own `gymapp` schema. Sign-ups there are real accounts
and the workouts and weigh-ins are real rows. That is the agreed arrangement
until go-live, when a fresh database and the reviewed legal wording land
together.

Two things are in place because of it:

- **`web/src/app/robots.ts` returns `disallow: /`.** The demo stays out of
  search results. Delete that one file at go-live — that is the entire change.
- **The disclaimer still says "prototype"** in clause 5, and still gates the
  app on acceptance. Both are correct for a demo.

At go-live, the sequence that matters: point the env vars at the new project,
run the migrations there (`./scripts/db-push.sh`), run
`supabase/scripts/01-expose-schema.sql`, update the redirect URLs, bump
`DISCLAIMER_VERSION` when the reviewed wording goes in, and delete `robots.ts`.

## Rolling back

Vercel keeps every deployment. Deployments → find the last good one →
**Promote to Production**. Instant, and it does not touch the database — so a
rollback that crosses a migration needs the migration reverted too. There is no
down-migration in this repo yet; if that becomes a real risk, that is the thing
to add.
