import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function membersPageData(newsroomId: string) {
  const supabase = await createClient();
  const [members, invitations, desks] = await Promise.all([
    supabase.rpc("newsroom_members", { target_newsroom: newsroomId }),
    supabase
      .from("invitations")
      .select("id, email, full_name, role, desk_id, expires_at, created_at, inviter:profiles!invitations_invited_by_fkey(full_name), desk:desks(name)")
      .eq("newsroom_id", newsroomId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("desks").select("id, name, created_at").eq("newsroom_id", newsroomId).order("name"),
  ]);
  if (members.error) throw members.error;
  const rows = members.data ?? [];
  const deskCounts = new Map<string, number>();
  for (const m of rows) if (m.desk_id && m.status === "active") deskCounts.set(m.desk_id, (deskCounts.get(m.desk_id) ?? 0) + 1);
  return {
    members: rows,
    invitations: invitations.data ?? [],
    desks: (desks.data ?? []).map((d) => ({ ...d, members: deskCounts.get(d.id) ?? 0 })),
  };
}

export type MembersPageData = Awaited<ReturnType<typeof membersPageData>>;

export async function newsroomPolicies(newsroomId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("newsrooms")
    .select(
      "id, name, require_approval_for_differs, escalate_on_verifier_objection, default_visibility, media_retention_days, brand_isnad_note, telegram_enabled, monthly_check_limit",
    )
    .eq("id", newsroomId)
    .single();
  if (error) throw error;
  return data;
}

export type NewsroomPolicies = Awaited<ReturnType<typeof newsroomPolicies>>;

export async function privateSources(newsroomId: string) {
  const supabase = await createClient();
  const [sources, documents] = await Promise.all([
    supabase
      .from("sources")
      .select(
        "id, slug, name_ar, name_en, tier, homepage_url, domains, update_frequency, access_methods, description_ar, status, health, health_note, last_fetched_at, proposal_note, proposed_by, created_at, updated_at",
      )
      .eq("newsroom_id", newsroomId)
      .order("created_at", { ascending: false }),
    supabase.from("documents").select("source_id, updated_at").eq("newsroom_id", newsroomId),
  ]);
  const counts = new Map<string, { n: number; last: string | null }>();
  for (const d of documents.data ?? []) {
    const entry = counts.get(d.source_id) ?? { n: 0, last: null };
    entry.n += 1;
    if (!entry.last || d.updated_at > entry.last) entry.last = d.updated_at;
    counts.set(d.source_id, entry);
  }
  const rows = (sources.data ?? []).map((s) => ({
    ...s,
    documents: counts.get(s.id)?.n ?? 0,
    lastDocumentAt: counts.get(s.id)?.last ?? null,
  }));
  return {
    sources: rows.filter((s) => s.status === "active" || s.status === "paused"),
    proposals: rows.filter((s) => s.status === "proposed" || s.status === "rejected"),
  };
}

export type PrivateSource = Awaited<ReturnType<typeof privateSources>>["sources"][number];

export type NewsroomStats = {
  month_start: string;
  checks_this_month: number;
  checks_last_month: number;
  media_minutes: number;
  by_kind: Record<string, number>;
  claims_this_month: number;
  claims_connected: number;
  awaiting_review: number;
  avg_review_hours: number | null;
  daily: Array<{ day: string; n: number }>;
  cost_usd: number;
  monthly_check_limit: number | null;
};

export const ACTIVITY_PAGE = 40;

export async function activityPageData(newsroomId: string, { before, userId }: { before?: string; userId?: string }) {
  const supabase = await createClient();
  const [stats, feed, members] = await Promise.all([
    supabase.rpc("newsroom_stats", { target_newsroom: newsroomId }),
    supabase.rpc("newsroom_activity", {
      target_newsroom: newsroomId,
      before_at: before ?? undefined,
      page_size: ACTIVITY_PAGE + 1,
      only_user: userId ?? undefined,
    }),
    supabase.rpc("newsroom_members", { target_newsroom: newsroomId }),
  ]);
  if (stats.error) throw stats.error;
  const rows = feed.data ?? [];
  return {
    stats: stats.data as unknown as NewsroomStats,
    feed: rows.slice(0, ACTIVITY_PAGE),
    hasMore: rows.length > ACTIVITY_PAGE,
    members: (members.data ?? []).map((m) => ({ id: m.user_id, name: m.full_name || m.email })),
  };
}

export type ActivityRow = Awaited<ReturnType<typeof activityPageData>>["feed"][number];
