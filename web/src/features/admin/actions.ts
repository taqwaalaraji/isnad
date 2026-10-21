"use server";

import { randomBytes } from "node:crypto";

import { refresh } from "next/cache";
import { z } from "zod";

import { getViewer } from "@/lib/auth";
import type { ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import { adminErrorKey } from "./errors";

const ROLES = ["journalist", "editor", "admin"] as const;

/** Every admin action re-checks the role here; the database checks it again. */
async function activeAdmin() {
  const viewer = await getViewer();
  if (!viewer?.active || viewer.active.role !== "admin") return null;
  return { ...viewer, active: viewer.active };
}

const uuid = z.string().uuid();

// ─── Members ──────────────────────────────────────────────────────────────────

export async function updateMember(userId: string, role: (typeof ROLES)[number], deskId: string | null): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  if (!uuid.safeParse(userId).success || !ROLES.includes(role) || (deskId && !uuid.safeParse(deskId).success)) {
    return { ok: false, error: "errors.generic" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member", {
    target_newsroom: viewer.active.newsroomId,
    target_user: userId,
    new_role: role,
    new_desk: deskId ?? undefined,
  });
  if (error) return { ok: false, error: adminErrorKey(error) };
  refresh();
  return { ok: true };
}

export async function setMemberStatus(userId: string, status: "active" | "deactivated"): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  if (!uuid.safeParse(userId).success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_status", {
    target_newsroom: viewer.active.newsroomId,
    target_user: userId,
    new_status: status,
  });
  if (error) return { ok: false, error: adminErrorKey(error) };
  refresh();
  return { ok: true };
}

// ─── Desks ────────────────────────────────────────────────────────────────────

const deskName = z.string().trim().min(1).max(60);

export async function addDesk(name: string): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  const parsed = deskName.safeParse(name);
  if (!parsed.success) return { ok: false, error: "admin.errors.deskNameRequired" };
  const supabase = await createClient();
  const { data: desk, error } = await supabase.from("desks").insert({ newsroom_id: viewer.active.newsroomId, name: parsed.data }).select("id").single();
  if (error || !desk) return { ok: false, error: adminErrorKey(error) };
  await supabase.rpc("log_activity", {
    target_newsroom: viewer.active.newsroomId,
    action_name: "desk.created",
    target_kind: "desk",
    target: desk.id,
    extra: { title: parsed.data },
  });
  refresh();
  return { ok: true };
}

export async function renameDesk(deskId: string, name: string): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  const parsed = deskName.safeParse(name);
  if (!parsed.success || !uuid.safeParse(deskId).success) return { ok: false, error: "admin.errors.deskNameRequired" };
  const supabase = await createClient();
  const { error } = await supabase.from("desks").update({ name: parsed.data }).eq("id", deskId).eq("newsroom_id", viewer.active.newsroomId);
  if (error) return { ok: false, error: adminErrorKey(error) };
  refresh();
  return { ok: true };
}

/** Members and checks on the desk stay; they just no longer belong to a desk. */
export async function deleteDesk(deskId: string): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  if (!uuid.safeParse(deskId).success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { data: desk } = await supabase.from("desks").select("name").eq("id", deskId).eq("newsroom_id", viewer.active.newsroomId).maybeSingle();
  if (!desk) return { ok: false, error: "errors.generic" };
  const { error } = await supabase.from("desks").delete().eq("id", deskId).eq("newsroom_id", viewer.active.newsroomId);
  if (error) return { ok: false, error: adminErrorKey(error) };
  await supabase.rpc("log_activity", {
    target_newsroom: viewer.active.newsroomId,
    action_name: "desk.deleted",
    target_kind: "desk",
    target: deskId,
    extra: { title: desk.name },
  });
  refresh();
  return { ok: true };
}

// ─── Policies ─────────────────────────────────────────────────────────────────

const policiesSchema = z.object({
  require_approval_for_differs: z.boolean(),
  escalate_on_verifier_objection: z.boolean(),
  default_visibility: z.enum(["private", "desk", "newsroom"]),
  media_retention_days: z.number().int().min(1).max(3650),
  brand_isnad_note: z.boolean(),
  telegram_enabled: z.boolean(),
});

export type PoliciesInput = z.input<typeof policiesSchema>;

export async function savePolicies(input: PoliciesInput): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  const parsed = policiesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { error } = await supabase.from("newsrooms").update(parsed.data).eq("id", viewer.active.newsroomId);
  if (error) return { ok: false, error: adminErrorKey(error) };
  await supabase.rpc("log_activity", {
    target_newsroom: viewer.active.newsroomId,
    action_name: "policies.updated",
    target_kind: "newsroom",
    target: viewer.active.newsroomId,
    extra: parsed.data,
  });
  refresh();
  return { ok: true };
}

// ─── Private sources and proposals ────────────────────────────────────────────

const FREQUENCIES = ["manual", "daily", "weekly", "monthly", "quarterly", "annual", "irregular"] as const;

const sourceSchema = z.object({
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  homepage: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v), "url")
    .default(""),
  tier: z.number().int().min(1).max(3),
  frequency: z.enum(FREQUENCIES).default("manual"),
  description: z.string().trim().max(1000).default(""),
  note: z.string().trim().max(1000).default(""),
});

export type SourceInput = z.input<typeof sourceSchema>;

function hostOf(url: string): string[] {
  try {
    return url ? [new URL(url).hostname.toLowerCase().replace(/^www\./, "")] : [];
  } catch {
    return [];
  }
}

function slugFor(newsroomSlug: string, nameEn: string): string {
  const base = nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return [newsroomSlug, base || "source", randomBytes(3).toString("hex")].join("-");
}

function sourceError(error: { message?: string; code?: string } | null): ActionResult {
  return { ok: false, error: adminErrorKey(error) };
}

/** Add a private source, or propose one for the shared registry (`proposal`). */
export async function createSource(input: SourceInput, proposal = false): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, error: field === "homepage" ? "admin.errors.urlInvalid" : "admin.errors.sourceNameRequired" };
  }
  const v = parsed.data;
  if (proposal && !v.homepage) return { ok: false, error: "admin.errors.urlInvalid" };
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("sources")
    .insert({
    newsroom_id: viewer.active.newsroomId,
    slug: slugFor(viewer.active.newsroomSlug, v.nameEn),
    name_ar: v.nameAr,
    name_en: v.nameEn,
    tier: v.tier,
    homepage_url: v.homepage || null,
    domains: hostOf(v.homepage),
    update_frequency: v.frequency,
    access_methods: ["manual"],
    description_ar: v.description || null,
    status: proposal ? "proposed" : "active",
    proposed_by: proposal ? viewer.id : null,
    proposal_note: proposal ? v.note || null : null,
    })
    .select("id")
    .single();
  if (error || !created) return sourceError(error);
  await supabase.rpc("log_activity", {
    target_newsroom: viewer.active.newsroomId,
    action_name: proposal ? "source.proposed" : "source.created",
    target_kind: "source",
    target: created.id,
    extra: { title: v.nameAr },
  });
  refresh();
  return { ok: true };
}

export async function updateSource(sourceId: string, input: SourceInput): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success || !uuid.safeParse(sourceId).success) {
    const field = parsed.success ? null : parsed.error.issues[0]?.path[0];
    return { ok: false, error: field === "homepage" ? "admin.errors.urlInvalid" : "admin.errors.sourceNameRequired" };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("sources")
    .update({
      name_ar: v.nameAr,
      name_en: v.nameEn,
      tier: v.tier,
      homepage_url: v.homepage || null,
      domains: hostOf(v.homepage),
      update_frequency: v.frequency,
      description_ar: v.description || null,
    })
    .eq("id", sourceId)
    .eq("newsroom_id", viewer.active.newsroomId)
    .in("status", ["active", "paused"]);
  if (error) return sourceError(error);
  refresh();
  return { ok: true };
}

export async function setSourceStatus(sourceId: string, status: "active" | "paused"): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  if (!uuid.safeParse(sourceId).success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("sources")
    .update({ status })
    .eq("id", sourceId)
    .eq("newsroom_id", viewer.active.newsroomId)
    .in("status", ["active", "paused"]);
  if (error) return sourceError(error);
  refresh();
  return { ok: true };
}

/** Propose an existing private source for the shared registry: a proposal row the Isnad team reviews. */
export async function proposeExistingSource(sourceId: string, note: string): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  if (!uuid.safeParse(sourceId).success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { data: source } = await supabase
    .from("sources")
    .select("name_ar, name_en, tier, homepage_url, update_frequency, description_ar")
    .eq("id", sourceId)
    .eq("newsroom_id", viewer.active.newsroomId)
    .maybeSingle();
  if (!source) return { ok: false, error: "errors.generic" };
  return createSource(
    {
      nameAr: source.name_ar,
      nameEn: source.name_en,
      tier: source.tier,
      homepage: source.homepage_url ?? "",
      frequency: FREQUENCIES.includes(source.update_frequency as (typeof FREQUENCIES)[number])
        ? (source.update_frequency as (typeof FREQUENCIES)[number])
        : "manual",
      description: source.description_ar ?? "",
      note,
    },
    true,
  );
}

/** Withdraw a pending proposal, or delete a private source that has no documents yet. */
export async function deleteSource(sourceId: string): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  if (!uuid.safeParse(sourceId).success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { count } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("source_id", sourceId);
  if ((count ?? 0) > 0) return { ok: false, error: "admin.errors.sourceHasDocuments" };
  const { error } = await supabase.from("sources").delete().eq("id", sourceId).eq("newsroom_id", viewer.active.newsroomId);
  if (error) return sourceError(error);
  refresh();
  return { ok: true };
}
