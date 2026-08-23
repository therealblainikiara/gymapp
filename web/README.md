# Gym App — web

Next.js App Router + Supabase PWA. Workouts, meals and recovery built around
the user's week, designed for over-40s.

```bash
cp .env.example .env.local   # fill in at least the two NEXT_PUBLIC_SUPABASE_* values
npm install
npm run dev                  # http://localhost:3000
```

Full setup — credentials, migrations, auth redirect URLs — is in
[`../docs/M2-SETUP.md`](../docs/M2-SETUP.md). What was built and why is in
[`../docs/M2-IMPLEMENTATION.md`](../docs/M2-IMPLEMENTATION.md).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run check` | Typecheck, lint, unit tests — run this before committing |
| `npm run test` / `npm run test:watch` | Vitest |
| `npm run gen:types` | Regenerate database types from a linked Supabase project |

Database policy tests live outside this directory: `../scripts/db-test.sh`.

## How it fits together

**The gate** — `src/proxy.ts` (Next 16's name for middleware) runs on every
navigation: refreshes the Supabase session, then blocks everything until the
current disclaimer version is accepted and intake is complete.

**Local-first** — the UI reads only from IndexedDB (`src/lib/local/`). Mutations
write the cache and append to an outbox; `src/lib/sync/` flushes it when the
network allows and merges the server's view back. Screens never await a
request, and the app works offline.

**Domain logic** — `src/lib/domain/` holds the plan generator, meal filtering,
nutrition targets, streak arithmetic and the media pipeline, ported from the
design prototype. These are pure functions with no React or Supabase in them,
which is why they carry most of the test suite.

**Design** — `src/app/industry.css` is the Industry token sheet, copied
verbatim from the design export. Take every colour, font, space and radius from
its variables; do not hard-code a value the tokens already carry.

## Things worth knowing before you change something

- **Dietary flags are hard filters.** A meal that does not satisfy every
  requirement is removed, and where a slot has no compliant option the fallback
  is labelled as non-compliant. Do not "soften" this into ranking.
- **The disclaimer wording is pending legal review.** Editing it requires
  bumping `DISCLAIMER_VERSION`, which re-gates every existing user.
- **Every database constraint has a client-side counterpart.** A write the
  database rejects stalls the whole outbox behind it, so `lib/sync/legacy.ts`
  and the store validate against exactly the constraints in the migration.
  Change one, change the other.
- **Never prefix a secret `NEXT_PUBLIC_`.** That prefix is what puts a value in
  the browser bundle.
