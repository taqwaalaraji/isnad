"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { subscribeAsUser } from "@/lib/supabase/realtime";

/** Refresh the server-rendered page when this check's rows change (debounced). */
export function useCheckRealtime(checkId: string, enabled = true) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const unsubscribe = subscribeAsUser(`check:${checkId}`, (channel) =>
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "checks", filter: `id=eq.${checkId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "claim_results", filter: `check_id=eq.${checkId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "claims", filter: `check_id=eq.${checkId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `check_id=eq.${checkId}` }, refresh),
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [checkId, enabled, router]);
}
