"use client";

import { createBrowserClient } from "@supabase/ssr";
import { DB_SCHEMA, type Database, type DbSchema } from "@/lib/types/database";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

let cached: ReturnType<typeof createBrowserClient<Database, DbSchema>> | null =
  null;

/**
 * One browser client per tab. Cached because every call creates a fresh auth
 * listener, and several of them racing on the same cookie is how sessions get
 * silently clobbered.
 *
 * Pinned to the `gymapp` schema: the project's `public` schema belongs to
 * other apps, and its `profiles` table is something else entirely.
 */
export function browserClient() {
  cached ??= createBrowserClient<Database, DbSchema>(
    supabaseUrl(),
    supabasePublishableKey(),
    { db: { schema: DB_SCHEMA } },
  );
  return cached;
}
