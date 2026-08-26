/**
 * The preview harness — a development-only way to render the signed-in app.
 *
 * Every screen behind `(app)` sits behind the auth gate, and the gate needs a
 * live Supabase project. That is correct for the product and useless for
 * looking at the screens: it means nothing under `/home`, `/train`, `/recover`,
 * `/diet` or `/progress` can be opened in a browser without a working session,
 * so a whole milestone of UI work can land having never been rendered.
 *
 * When this flag is on, the gate is skipped and the local store is opened
 * against a fixed fake user id. Nothing else changes — the screens, the shell,
 * the plan generators and the local store are the real ones, which is the whole
 * point. A harness that renders a copy of the UI proves nothing about the UI.
 *
 * Two independent locks, because "the auth gate is off" is the single worst
 * thing that could escape into a deployment:
 *
 *   1. `NODE_ENV !== "production"` — `next build` sets it, so a production
 *      bundle has the flag compiled out no matter what the environment says.
 *   2. `NEXT_PUBLIC_PREVIEW_HARNESS === "1"` — absent from `.env.local` and
 *      from `.env.example`, so it has to be passed deliberately on the command
 *      line for one run.
 *
 * Turning it on is therefore `NEXT_PUBLIC_PREVIEW_HARNESS=1 npm run dev`, and
 * there is no combination of Vercel settings that reaches it.
 */
export const PREVIEW_HARNESS =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_PREVIEW_HARNESS === "1";

/**
 * The fake identity. A valid v4 UUID, because it is used as a database name
 * (`gymapp:<uid>`) and is written into `user_id` on every fixture row, so a
 * shape the real schema would reject would hide problems rather than expose
 * them. Nil-prefixed so it is obviously not a real account if it ever shows up
 * in a screenshot or a log.
 */
export const PREVIEW_USER_ID = "00000000-0000-4000-8000-000000f12700";
