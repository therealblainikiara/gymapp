import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { DB_SCHEMA, type Database, type DbSchema } from "@/lib/types/database";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/**
 * Request-scoped client for server components, route handlers and actions.
 * Reads the session from cookies and writes refreshed tokens back.
 *
 * Pinned to the `gymapp` schema — see lib/types/database.ts.
 */
export async function serverClient() {
  const store = await cookies();
  return createServerClient<Database, DbSchema>(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      db: { schema: DB_SCHEMA },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              store.set(name, value, options);
            }
          } catch {
            // Called from a server component, where the cookie jar is
            // read-only. The proxy already refreshed the session for this
            // request, so there is nothing to recover here.
          }
        },
      },
    },
  );
}
