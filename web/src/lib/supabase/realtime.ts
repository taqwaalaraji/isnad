"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { getBrowserClient } from "./browser";

/**
 * Subscribe to a realtime channel as the signed-in user. The browser client reads its session from
 * cookies asynchronously; a channel joined before that would join as anonymous and row-level security
 * would filter out every change. Returns an unsubscribe function (safe to call before the join).
 */
export function subscribeAsUser(name: string, configure: (channel: RealtimeChannel) => RealtimeChannel): () => void {
  const supabase = getBrowserClient();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  void supabase.auth.getSession().then(({ data }) => {
    if (cancelled) return;
    if (data.session) supabase.realtime.setAuth(data.session.access_token);
    channel = configure(supabase.channel(name)).subscribe();
  });

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
