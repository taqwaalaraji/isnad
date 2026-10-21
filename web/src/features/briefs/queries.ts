import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { BriefContent } from "./types";

const BRIEF_FIELDS =
  "id, title, guest_name, interview_date, status, error, content, created_at, updated_at, created_by, entity:entities(id, name_ar, name_en, short_name_ar, short_name_en), topic:topics(id, name_ar, name_en), author:profiles!briefs_created_by_fkey(full_name)";

export async function listBriefs(newsroomId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("briefs")
    .select(BRIEF_FIELDS)
    .eq("newsroom_id", newsroomId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []).map((b) => ({ ...b, content: (b.content ?? {}) as BriefContent }));
}

export type BriefRow = Awaited<ReturnType<typeof listBriefs>>[number];

export async function getBrief(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("briefs").select(BRIEF_FIELDS).eq("id", id).maybeSingle();
  if (!data) return null;
  const content = (data.content ?? {}) as BriefContent;

  // Briefs written before figures carried their document: look the evidence up (approved figures only).
  const missing = (content.figures ?? []).filter((f) => !f.document_id).map((f) => f.id);
  if (missing.length) {
    const { data: rows } = await supabase.from("figures").select("id, document_id, indicator_id").in("id", missing);
    const byId = new Map((rows ?? []).map((r) => [r.id, r]));
    content.figures = content.figures!.map((f) => {
      const row = byId.get(f.id);
      return row ? { ...f, document_id: row.document_id, indicator_id: row.indicator_id ?? undefined } : f;
    });
  }
  return { ...data, content };
}

export type BriefDetail = NonNullable<Awaited<ReturnType<typeof getBrief>>>;

export async function briefFormOptions() {
  const supabase = await createClient();
  const [entities, topics] = await Promise.all([
    supabase.from("entities").select("id, name_ar, name_en, level, emirate").order("name_ar").limit(1000),
    supabase.from("topics").select("id, name_ar, name_en").order("sort_order"),
  ]);
  return { entities: entities.data ?? [], topics: topics.data ?? [] };
}

export type BriefFormOptions = Awaited<ReturnType<typeof briefFormOptions>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Prepare brief" links from the registry pass an entity (id or slug) or an indicator slug. */
export async function resolveBriefPrefill(query: { entity?: string; indicator?: string }) {
  const supabase = await createClient();
  const [entity, indicator] = await Promise.all([
    query.entity
      ? supabase.from("entities").select("id").eq(UUID.test(query.entity) ? "id" : "slug", query.entity).maybeSingle()
      : null,
    query.indicator
      ? supabase.from("indicators").select("topic_id").eq(UUID.test(query.indicator) ? "id" : "slug", query.indicator).maybeSingle()
      : null,
  ]);
  return { entityId: entity?.data?.id, topicId: indicator?.data?.topic_id ?? undefined };
}
