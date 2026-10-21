import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

/** Anonymous, cookie-free access for public pages (cacheable; only anon-granted data is reachable). */
export function createPublicClient() {
  return createSupabaseClient<Database>(env.supabaseUrl, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
