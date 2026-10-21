"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser client for realtime subscriptions and direct uploads, as the signed-in user. */
export function getBrowserClient() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}
