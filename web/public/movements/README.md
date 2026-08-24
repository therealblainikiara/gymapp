# Movement illustrations

One PNG per movement, named by the same slug the detail routes use —
`goblet-squat.png` serves `/train/goblet-squat`.

Generate them from `docs/C17-IMAGE-PROMPTS.md`, then add the slug to `CURATED`
in `web/src/lib/domain/media.ts`. A curated illustration wins over the Wikimedia
lookup for that movement, and `media.test.ts` fails if `CURATED` names a slug
that is not a real movement.

Regenerate the prompts after adding or renaming a movement:

    node scripts/image-prompts.mjs --out docs/C17-IMAGE-PROMPTS.md

The generator refuses to run when `assets/movement-poses.json` and the
libraries disagree, so a new movement cannot ship without a pose description.
