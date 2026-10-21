"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { subscribeAsUser } from "@/lib/supabase/realtime";

type Table = "document_versions" | "eval_runs";

/** Refresh the server-rendered page when rows of these tables change (debounced). */
export function LiveRefresh({ tables, channel }: { tables: Table[]; channel: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(",");

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 800);
    };
    const unsubscribe = subscribeAsUser(`console:${channel}`, (sub) => {
      let configured = sub;
      for (const table of key.split(",")) configured = configured.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
      return configured;
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [key, channel, router]);

  return null;
}
