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

/** Public origin, used to build magic-link and OAuth redirect URLs. */
export const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
