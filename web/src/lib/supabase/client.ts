"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * One browser client per tab. Cached because every call creates a fresh auth
 * listener, and several of them racing on the same cookie is how sessions get
 * silently clobbered.
 */
export function browserClient() {
  cached ??= createBrowserClient<Database>(
    supabaseUrl(),
    supabasePublishableKey(),
  );
  return cached;
}
