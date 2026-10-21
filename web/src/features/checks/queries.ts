import "server-only";

import type { Viewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { likePattern } from "@/lib/text";
import type { CheckStatus, ClaimResultRow } from "@/lib/types";

export const PAGE_SIZE = 20;

export type CheckFilter = "all" | "mine" | "awaitingMe" | "approved" | "published" | "archived";

const LIST_FIELDS =
  "id, title, input_kind, status, stage, progress, claim_count, match_count, context_count, differs_count, none_count, created_at, created_by, recorded_at, desk_id, media(duration_ms), owner:profiles!checks_created_by_fkey(full_name), desk:desks(name)";

export async function listChecks(viewer: Viewer, { filter, q, page }: { filter: CheckFilter; q?: string; page: number }) {
  const supabase = await createClient();
  const newsroomId = viewer.active!.newsroomId;
  let query = supabase.from("checks").select(LIST_FIELDS, { count: "exact" }).eq("newsroom_id", newsroomId);

  switch (filter) {
    case "mine":
      query = query.eq("created_by", viewer.id).neq("status", "archived");
      break;
    case "awaitingMe":
      query = query
        .in("status", ["awaiting_review", "in_review", "escalated"] satisfies CheckStatus[])
        .or(`assigned_editor_id.is.null,assigned_editor_id.eq.${viewer.id}`);
      break;
    case "approved":
    case "published":
    case "archived":
      query = query.eq("status", filter);
      break;
    default:
      query = query.neq("status", "archived");
  }
  if (q?.trim()) query = query.ilike("search_text", likePattern(q));

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function filterCounts(viewer: Viewer) {
  const supabase = await createClient();
  const newsroomId = viewer.active!.newsroomId;
  const base = () => supabase.from("checks").select("id", { count: "exact", head: true }).eq("newsroom_id", newsroomId);
  const [all, mine, awaiting, approved, published] = await Promise.all([
    base().neq("status", "archived"),
    base().eq("created_by", viewer.id).neq("status", "archived"),
    base()
      .in("status", ["awaiting_review", "in_review", "escalated"])
      .or(`assigned_editor_id.is.null,assigned_editor_id.eq.${viewer.id}`),
    base().eq("status", "approved"),
    base().eq("status", "published"),
  ]);
  return {
    all: all.count ?? 0,
    mine: mine.count ?? 0,
    awaitingMe: awaiting.count ?? 0,
    approved: approved.count ?? 0,
    published: published.count ?? 0,
  };
}

export async function homeData(viewer: Viewer) {
  const supabase = await createClient();
  const newsroomId = viewer.active!.newsroomId;
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86400_000).toISOString();
  const twoWeeksAgo = new Date(now - 14 * 86400_000).toISOString();
  const decides = viewer.active!.role !== "journalist";

  const awaitingQuery = supabase
    .from("checks")
    .select(LIST_FIELDS)
    .eq("newsroom_id", newsroomId)
    .in("status", decides ? ["awaiting_review", "in_review", "escalated"] : ["escalated"])
    .order("created_at", { ascending: true })
    .limit(20);

  const [thisWeek, lastWeek, claims, awaiting, processing, recent, alerts] = await Promise.all([
    supabase.from("checks").select("id", { count: "exact", head: true }).eq("newsroom_id", newsroomId).gte("created_at", weekAgo),
    supabase
      .from("checks")
      .select("id", { count: "exact", head: true })
      .eq("newsroom_id", newsroomId)
      .gte("created_at", twoWeeksAgo)
      .lt("created_at", weekAgo),
    supabase
      .from("claim_results")
      .select("chain_status, checks!inner(newsroom_id, created_at)")
      .eq("checks.newsroom_id", newsroomId)
      .gte("checks.created_at", weekAgo)
      .neq("verdict", "none"),
    decides ? awaitingQuery.or(`assigned_editor_id.is.null,assigned_editor_id.eq.${viewer.id}`) : awaitingQuery.eq("created_by", viewer.id),
    supabase
      .from("checks")
      .select("id, title, input_kind, progress, stage")
      .eq("newsroom_id", newsroomId)
      .eq("status", "processing")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.from("checks").select(LIST_FIELDS).eq("newsroom_id", newsroomId).neq("status", "archived").order("created_at", { ascending: false }).limit(6),
    supabase
      .from("alerts")
      .select("id, kind, title, body, payload, created_at, read_at")
      .eq("newsroom_id", newsroomId)
      .or(`user_id.eq.${viewer.id},user_id.is.null`)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(2),
  ]);

  const verified = claims.data ?? [];
  return {
    thisWeek: thisWeek.count ?? 0,
    lastWeek: lastWeek.count ?? 0,
    numbersChecked: verified.length,
    numbersConnected: verified.filter((c) => c.chain_status === "connected").length,
    awaiting: awaiting.data ?? [],
    processing: processing.data ?? [],
    recent: recent.data ?? [],
    alerts: alerts.data ?? [],
  };
}

export type CheckListRow = Awaited<ReturnType<typeof listChecks>>["rows"][number];

export async function getCheckDetail(id: string) {
  const supabase = await createClient();
  const { data: check } = await supabase
    .from("checks")
    .select(
      "*, owner:profiles!checks_created_by_fkey(id, full_name), editor:profiles!checks_assigned_editor_id_fkey(id, full_name), desk:desks(name), newsroom:newsrooms(name, require_approval_for_differs, brand_isnad_note, media_retention_days)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!check) return null;

  const [segments, claims, media, decisions, comments] = await Promise.all([
    supabase.from("segments").select("*").eq("check_id", id).order("idx"),
    supabase.from("claims").select("*, result:claim_results(*)").eq("check_id", id).order("idx"),
    supabase.from("media").select("*").eq("check_id", id).maybeSingle(),
    supabase.from("decisions").select("*, user:profiles(full_name)").eq("check_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("comments").select("*, user:profiles(full_name)").eq("check_id", id).order("created_at"),
  ]);

  // Media lives in a private bucket: sign short-lived URLs after RLS confirmed the viewer can see the check.
  let urls: { video?: string; audio?: string; poster?: string; original?: string } = {};
  const admin = createAdminClient();
  const sign = async (path: string | null | undefined) =>
    path ? (await admin.storage.from("media").createSignedUrl(path, 60 * 60 * 6)).data?.signedUrl : undefined;
  if (media.data) {
    const [video, audio, poster] = await Promise.all([
      sign(media.data.video_path),
      sign(media.data.audio_path),
      sign(media.data.poster_path),
    ]);
    urls = { video, audio, poster };
  } else if (check.input_kind === "document") {
    urls = { original: await sign(check.storage_path) };
  }

  return {
    check,
    segments: segments.data ?? [],
    // claim_results is one-to-one with claims; PostgREST may still return it as a list.
    claims: (claims.data ?? []).map((c) => {
      const result = c.result as ClaimResultRow | ClaimResultRow[] | null;
      return { ...c, result: Array.isArray(result) ? (result[0] ?? null) : result };
    }),
    media: media.data,
    urls,
    decisions: decisions.data ?? [],
    comments: comments.data ?? [],
  };
}

export type CheckDetail = NonNullable<Awaited<ReturnType<typeof getCheckDetail>>>;

export async function newsroomEditors(newsroomId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("user_id, role, desk_id, profiles(full_name)")
    .eq("newsroom_id", newsroomId)
    .eq("status", "active")
    .in("role", ["editor", "admin"]);
  return (data ?? []).map((m) => ({ id: m.user_id, name: m.profiles?.full_name ?? "", deskId: m.desk_id }));
}

export async function newsroomDesks(newsroomId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("desks").select("id, name").eq("newsroom_id", newsroomId).order("name");
  return data ?? [];
}
