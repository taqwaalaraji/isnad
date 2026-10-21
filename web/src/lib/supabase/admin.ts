import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

/**
 * Bypasses row-level security. Only for work that has already been authorized in code
 * (signed URLs, invitations, cross-newsroom aggregates for Isnad staff).
 */
export function createAdminClient() {
  return createClient<Database>(env.supabaseUrl, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
