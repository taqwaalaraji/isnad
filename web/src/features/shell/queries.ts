import "server-only";

import type { Viewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function newsroomCounts(viewer: Viewer) {
  if (!viewer.active) return { review: 0, alerts: 0 };
  const supabase = await createClient();
  const decides = viewer.active.role !== "journalist";
  const review = decides
    ? supabase
        .from("checks")
        .select("id", { count: "exact", head: true })
        .eq("newsroom_id", viewer.active.newsroomId)
        .in("status", ["awaiting_review", "in_review", "escalated"])
        .or(`assigned_editor_id.is.null,assigned_editor_id.eq.${viewer.id}`)
    : supabase
        .from("checks")
        .select("id", { count: "exact", head: true })
        .eq("newsroom_id", viewer.active.newsroomId)
        .eq("created_by", viewer.id)
        .eq("status", "escalated");
  const alerts = supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("newsroom_id", viewer.active.newsroomId)
    .is("read_at", null)
    .or(`user_id.eq.${viewer.id},user_id.is.null`);
  const [r, a] = await Promise.all([review, alerts]);
  return { review: r.count ?? 0, alerts: a.count ?? 0 };
}

export async function consoleCounts() {
  const supabase = await createClient();
  const [inbox, review, proposals] = await Promise.all([
    supabase
      .from("document_versions")
      .select("id", { count: "exact", head: true })
      .in("extraction_status", ["pending", "extracting", "failed"]),
    supabase.from("figures").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    supabase.from("sources").select("id", { count: "exact", head: true }).eq("status", "proposed"),
  ]);
  return { inbox: inbox.count ?? 0, review: review.count ?? 0, proposals: proposals.count ?? 0 };
}
