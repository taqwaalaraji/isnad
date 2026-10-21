"use server";

import { randomUUID } from "node:crypto";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getViewer } from "@/lib/auth";
import { type ActionResult, errorKey } from "@/lib/errors";
import { isLocale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";

import { PERIODS } from "./types";

const schema = z.object({
  locale: z.string(),
  entityId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  guestName: z.string().trim().max(200).default(""),
  interviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  periodMonths: z.number().int().refine((n) => (PERIODS as readonly number[]).includes(n)),
  revisions: z.boolean(),
  statements: z.boolean(),
  questions: z.boolean(),
});

export type CreateBriefInput = z.input<typeof schema>;

export async function createBrief(input: CreateBriefInput): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.active) return { ok: false, error: "errors.not_authenticated" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path[0] === "entityId" ? "briefs.errors.entityRequired" : "errors.generic" };
  const v = parsed.data;
  const supabase = await createClient();
  const { data: entity } = await supabase.from("entities").select("name_ar, name_en, short_name_ar, short_name_en").eq("id", v.entityId).maybeSingle();
  if (!entity) return { ok: false, error: "briefs.errors.entityRequired" };
  const locale = isLocale(v.locale) ? v.locale : "ar";
  const entityName = locale === "ar" ? entity.short_name_ar || entity.name_ar : entity.short_name_en || entity.name_en;

  // The id is chosen here: the insert can't return the row (no update policy is needed that way either).
  const id = randomUUID();
  const { error } = await supabase.from("briefs").insert({
    id,
    newsroom_id: viewer.active.newsroomId,
    created_by: viewer.id,
    entity_id: v.entityId,
    topic_id: v.topicId,
    title: (v.guestName || entityName).slice(0, 300),
    guest_name: v.guestName || null,
    interview_date: v.interviewDate,
    content: { options: { period_months: v.periodMonths, revisions: v.revisions, statements: v.statements, questions: v.questions } },
  });
  if (error) return { ok: false, error: errorKey(error) };
  redirect(`/${locale}/briefs/${id}`);
}

export async function regenerateBrief(briefId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  if (!z.string().uuid().safeParse(briefId).success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_brief", { target_brief: briefId });
  if (error) return { ok: false, error: errorKey(error) };
  refresh();
  return { ok: true };
}

export async function deleteBrief(briefId: string, locale: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  if (!z.string().uuid().safeParse(briefId).success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { error, count } = await supabase.from("briefs").delete({ count: "exact" }).eq("id", briefId);
  if (error || !count) return { ok: false, error: error ? errorKey(error) : "errors.not_allowed" };
  redirect(`/${isLocale(locale) ? locale : "ar"}/briefs`);
}
