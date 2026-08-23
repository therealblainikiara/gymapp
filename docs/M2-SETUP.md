# M2 — Setup

Everything needed to take this repository from a clone to a signed-in, syncing
app. Roughly 15 minutes, most of it waiting on the Supabase dashboard.

## 1. What you need

| Credential | Where | Needed for |
|---|---|---|
| Project URL + **publishable key** (`sb_publishable_…`) | Dashboard → Settings → API Keys | The browser client. Both are public by design — they ship in the JS bundle, and RLS is what protects the data. |
| **Database password** *or* a linked Supabase CLI | Settings → Database → Connection string (or *Reset password*) | Applying the migrations. The publishable key cannot create tables. |
| **Secret key** (`sb_secret_…`) | Settings → API Keys | Not needed to run the app. Required by the weekly-challenge job (M3) and any admin tooling. Server-only. |
| Google OAuth client ID + secret | Google Cloud Console → APIs & Services → Credentials | Only if you want the Google button live. Magic links work without it. |
| Anthropic API key | console.anthropic.com | Only for live coach feedback. Without it the camera screen uses its built-in cues and the app is otherwise unaffected. |

## 2. Environment

```bash
cd web
cp .env.example .env.local   # then fill it in
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are the
only two required to boot. `.env.local` is gitignored; `.env.example` is the
committed template.

Never give `SUPABASE_SECRET_KEY` or `ANTHROPIC_API_KEY` a `NEXT_PUBLIC_`
prefix — that prefix is what puts a value in the browser bundle.

## 3. Apply the schema

```bash
DATABASE_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres' \
  ./scripts/db-push.sh
```

or, with the CLI linked (`supabase link --project-ref <ref>`):

```bash
./scripts/db-push.sh --cli
```

This creates the tables, the `weekly_active_minutes` view, RLS policies, the
signup trigger and the two security-definer RPCs. See
[M2-SCHEMA-CHANGELOG.md](./M2-SCHEMA-CHANGELOG.md) for how it differs from the
draft in `project/supabase/0001_init.sql`.

To check the policies before or after pushing, run them against a scratch
Postgres — no Supabase project involved:

```bash
./scripts/db-test.sh          # applies migrations + runs supabase/tests/01_rls.sql
```

## 4. Auth configuration

**Dashboard → Authentication → URL Configuration.** Magic links silently fail
to redirect without these.

| Field | Value |
|---|---|
| Site URL | `http://localhost:3000` (dev) / your deployed origin |
| Redirect URLs | `http://localhost:3000/auth/callback`, and the same path on every deployed origin |

Add preview deployment origins too if you use them — the callback URL is built
from `window.location.origin`, so a preview domain that is not on the allowlist
will bounce.

**For Google:** Dashboard → Authentication → Providers → Google, paste the
client ID and secret. In Google Cloud Console the authorised redirect URI is
Supabase's, not yours:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

## 5. Run it

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

The first request redirects to `/sign-in`. After the magic link you get the
disclaimer, then the intake wizard, then Home.

## 6. Checks

```bash
cd web
npm run check        # typecheck + lint + 115 unit tests
```

```bash
# Database policies, against a local Postgres (needs psql; no project required)
PGHOST=/var/run/postgresql ./scripts/db-test.sh
```

## Deploying

Set the same environment variables in the host, with
`NEXT_PUBLIC_SITE_URL` pointing at the real origin, and add
`<origin>/auth/callback` to the Supabase redirect allowlist.

One thing to know about the gate: it runs a `profiles` query on every
navigation. That is the deliberate cost of enforcing the disclaimer at the edge
rather than in a layout. If it ever shows up in latency, the fix is a custom
access-token hook that stamps `disclaimer_version` into the JWT — then the gate
reads a claim instead of the database. It is not worth doing before there is a
measurement that says so.
