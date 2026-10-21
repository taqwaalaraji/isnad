import "server-only";

import type { Viewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { type AlertFilter, FILTER_KINDS } from "./groups";

export async function alertsPageData(viewer: Viewer & { active: NonNullable<Viewer["active"]> }, filter: AlertFilter) {
  const supabase = await createClient();
  const newsroomId = viewer.active.newsroomId;
  const mine = `user_id.eq.${viewer.id},user_id.is.null`;

  let list = supabase
    .from("alerts")
    .select("id, kind, title, body, payload, created_at, read_at")
    .eq("newsroom_id", newsroomId)
    .or(mine)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter === "unread") list = list.is("read_at", null);
  else if (filter !== "all") list = list.in("kind", FILTER_KINDS[filter]);

  const [alerts, kinds, follows, profile, telegram] = await Promise.all([
    list,
    supabase.from("alerts").select("kind, read_at").eq("newsroom_id", newsroomId).or(mine).is("dismissed_at", null).limit(1000),
    supabase.from("follows").select("target_type, target_id, created_at").eq("user_id", viewer.id).eq("newsroom_id", newsroomId).order("created_at"),
    supabase.from("profiles").select("notification_prefs").eq("id", viewer.id).single(),
    supabase.from("telegram_links").select("user_id").eq("user_id", viewer.id).maybeSingle(),
  ]);

  const counts: Record<AlertFilter, number> = { all: 0, unread: 0, revisions: 0, releases: 0, decisions: 0, ready: 0 };
  for (const a of kinds.data ?? []) {
    counts.all++;
    if (!a.read_at) counts.unread++;
    for (const [group, list] of Object.entries(FILTER_KINDS)) if (list.includes(a.kind)) counts[group as keyof typeof FILTER_KINDS]++;
  }

  // Names for what the viewer follows.
  const rows = follows.data ?? [];
  const indicatorIds = rows.filter((f) => f.target_type === "indicator").map((f) => f.target_id);
  const entityIds = rows.filter((f) => f.target_type === "entity").map((f) => f.target_id);
  const [indicators, entities] = await Promise.all([
    indicatorIds.length ? supabase.from("indicators").select("id, name_ar, name_en").in("id", indicatorIds) : Promise.resolve({ data: [] }),
    entityIds.length ? supabase.from("entities").select("id, name_ar, name_en").in("id", entityIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map<string, { name_ar: string; name_en: string }>();
  for (const r of [...(indicators.data ?? []), ...(entities.data ?? [])]) names.set(r.id, r);

  const prefs = (profile.data?.notification_prefs ?? {}) as { telegram?: boolean };
  return {
    alerts: (alerts.data ?? []).map((a) => ({ ...a, payload: (a.payload ?? {}) as Record<string, unknown> })),
    counts,
    follows: rows
      .filter((f) => names.has(f.target_id))
      .map((f) => ({ type: f.target_type, id: f.target_id, ...names.get(f.target_id)! })),
    delivery: { telegram: !!telegram.data && prefs.telegram !== false },
  };
}

export type AlertsPageData = Awaited<ReturnType<typeof alertsPageData>>;
export type AlertItem = AlertsPageData["alerts"][number];
