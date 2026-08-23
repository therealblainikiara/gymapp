/**
 * Environment access, in one place so a missing variable fails loudly at the
 * edge of the app rather than as an opaque 500 three layers in.
 *
 * The publishable key is deliberately public: it is the browser's identity and
 * every table it can reach is protected by row-level security. The secret key
 * and the Anthropic key are server-only and must never be prefixed NEXT_PUBLIC_.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabasePublishableKey = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

/** Server-only. Bypasses RLS — never import this from a client component. */
export const supabaseSecretKey = () =>
  required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);

export const anthropicApiKey = () => process.env.ANTHROPIC_API_KEY;

// There is deliberately no configured site URL. Every absolute URL this app
// builds comes from the request it is serving — `window.location.origin` in
// the browser, `request.nextUrl.origin` on the server — so localhost, a Vercel
// preview deployment and production all work with no per-environment value to
// set or to get wrong. The only place origins have to be listed is Supabase's
// redirect allowlist; see docs/M2-DEPLOY.md.
