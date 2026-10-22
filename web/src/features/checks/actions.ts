"use server";

import { randomUUID } from "node:crypto";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getViewer } from "@/lib/auth";
import { type ActionResult, errorKey } from "@/lib/errors";
import { isLocale } from "@/lib/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_UPLOAD = 500 * 1024 * 1024;
const MEDIA_TYPES: Record<string, "video" | "audio" | "document"> = {
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
  "video/x-matroska": "video",
  "video/mpeg": "video",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/x-m4a": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/ogg": "audio",
  "audio/webm": "audio",
  "audio/flac": "audio",
  "audio/aac": "audio",
  "application/pdf": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "text/plain": "document",
  "text/html": "document",
};

function extensionFor(name: string): string {
  const match = /\.([a-z0-9]{1,6})$/i.exec(name);
  return match ? `.${match[1].toLowerCase()}` : "";
}

/** Step 1 of an upload: a signed URL for one object under the newsroom's folder. */
export async function createUploadUrl(input: { name: string; size: number; type: string }): Promise<
  ActionResult<{ path: string; signedUrl: string; kind: "video" | "audio" | "document" }>
> {
  const viewer = await getViewer();
  if (!viewer?.active) return { ok: false, error: "errors.not_authenticated" };
  const kind = MEDIA_TYPES[input.type];
  if (!kind) return { ok: false, error: "newCheck.fileUnsupported" };
  if (input.size > MAX_UPLOAD) return { ok: false, error: "newCheck.fileTooLarge" };

  const path = `${viewer.active.newsroomId}/${randomUUID()}/original${extensionFor(input.name)}`;
  const { data, error } = await createAdminClient().storage.from("media").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "newCheck.uploadFailed" };
  return { ok: true, data: { path, signedUrl: data.signedUrl, kind } };
}

const createSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("file"),
    storagePath: z.string().min(10),
    fileName: z.string().max(300),
    fileType: z.string(),
    fileSize: z.number().int().positive(),
  }),
  z.object({ source: z.literal("link"), url: z.string().trim().url().regex(/^https?:\/\//i) }),
  z.object({ source: z.literal("text"), text: z.string().trim().min(20).max(100_000) }),
]);

const metaSchema = z.object({
  locale: z.string(),
  title: z.string().trim().min(1).max(300),
  recordedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deskId: z.string().uuid().nullable(),
  speakers: z.string().trim().max(300).optional(),
  dialect: z.enum(["msa", "gulf", "egyptian", "levantine", "other"]),
  visibility: z.enum(["private", "desk", "newsroom"]),
});

export type CreateCheckInput = z.input<typeof createSchema> & z.input<typeof metaSchema>;

export async function createCheck(input: CreateCheckInput): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.active) return { ok: false, error: "errors.not_authenticated" };
  const meta = metaSchema.safeParse(input);
  const body = createSchema.safeParse(input);
  if (!meta.success) return { ok: false, error: "newCheck.errors.titleRequired" };
  if (!body.success) {
    const source = (input as { source?: string }).source;
    return { ok: false, error: source === "link" ? "newCheck.errors.linkInvalid" : source === "text" ? "newCheck.errors.textShort" : "newCheck.errors.needInput" };
  }
  const newsroomId = viewer.active.newsroomId;
  const supabase = await createClient();

  const { data: newsroom } = await supabase.from("newsrooms").select("monthly_check_limit").eq("id", newsroomId).single();
  if (newsroom?.monthly_check_limit) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("checks")
      .select("id", { count: "exact", head: true })
      .eq("newsroom_id", newsroomId)
      .gte("created_at", monthStart.toISOString());
    if ((count ?? 0) >= newsroom.monthly_check_limit) return { ok: false, error: "newCheck.errors.limitReached" };
  }

  let deskId = meta.data.deskId;
  if (deskId) {
    const { data: desk } = await supabase.from("desks").select("id").eq("id", deskId).eq("newsroom_id", newsroomId).maybeSingle();
    if (!desk) deskId = null;
  }

  // The id is chosen here: the select policy can't see a row inside its own INSERT, so RETURNING would fail.
  const checkId = randomUUID();
  const row: Record<string, unknown> = {
    id: checkId,
    newsroom_id: newsroomId,
    created_by: viewer.id,
    title: meta.data.title,
    recorded_at: meta.data.recordedAt,
    desk_id: deskId,
    speakers: meta.data.speakers || null,
    dialect: meta.data.dialect,
    visibility: meta.data.visibility,
  };

  const value = body.data;
  if (value.source === "file") {
    if (!value.storagePath.startsWith(`${newsroomId}/`)) return { ok: false, error: "errors.not_allowed" };
    const kind = MEDIA_TYPES[value.fileType];
    if (!kind) return { ok: false, error: "newCheck.fileUnsupported" };
    const admin = createAdminClient();
    const folder = value.storagePath.slice(0, value.storagePath.lastIndexOf("/"));
    const { data: listed } = await admin.storage.from("media").list(folder);
    if (!listed?.some((f) => value.storagePath.endsWith(`/${f.name}`))) return { ok: false, error: "newCheck.uploadFailed" };
    Object.assign(row, {
      input_kind: kind,
      storage_path: value.storagePath,
      original_filename: value.fileName,
      mime_type: value.fileType,
      size_bytes: value.fileSize,
    });
  } else if (value.source === "link") {
    Object.assign(row, { input_kind: "link", input_url: value.url });
  } else {
    Object.assign(row, { input_kind: "text", input_text: value.text });
  }

  const { error } = await supabase.from("checks").insert(row as never);
  if (error) {
    console.error("createCheck: insert failed", error.message);
    return { ok: false, error: errorKey(error) };
  }
  await supabase.rpc("log_activity", {
    target_newsroom: newsroomId,
    action_name: "check.created",
    target_kind: "check",
    target: checkId,
    extra: { title: meta.data.title, kind: row.input_kind as string },
  });
  const locale = isLocale(meta.data.locale) ? meta.data.locale : "ar";
  redirect(`/${locale}/checks/${checkId}`);
}

async function rpc(name: string, args: Record<string, unknown>): Promise<ActionResult<unknown>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) return { ok: false, error: errorKey(error) };
  refresh();
  return { ok: true, data };
}

export async function decideClaim(claimId: string, decision: "approve" | "edit" | "escalate" | "reopen", note?: string, wording?: string) {
  return rpc("decide_claim", { target_claim: claimId, decision, note: note ?? null, wording: wording ?? null });
}

export async function approveMatches(checkId: string) {
  return rpc("approve_matches", { target_check: checkId }) as Promise<ActionResult<number>>;
}

export async function sendForReview(checkId: string, editorId: string | null) {
  return rpc("send_for_review", { target_check: checkId, editor: editorId });
}

export async function approveCheck(checkId: string) {
  return rpc("approve_check", { target_check: checkId });
}

export async function publishCheck(checkId: string, url: string) {
  const res = (await rpc("publish_check", { target_check: checkId, url: url.trim() })) as ActionResult<string>;
  if (res.ok && res.data) updateTag(`public-note:${res.data}`);
  return res;
}

export async function archiveCheck(checkId: string) {
  const res = await rpc("archive_check", { target_check: checkId });
  if (res.ok) await expirePublicNote(checkId);
  return res;
}

export async function recheck(checkId: string) {
  const res = await rpc("request_recheck", { target_check: checkId });
  if (res.ok) await expirePublicNote(checkId);
  return res;
}

/** The public evidence page is cached for a few minutes: drop it when its check changes. */
async function expirePublicNote(checkId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("checks").select("public_slug").eq("id", checkId).maybeSingle();
  if (data?.public_slug) updateTag(`public-note:${data.public_slug}`);
}

export async function searchClaim(claimId: string) {
  return rpc("request_claim_search", { target_claim: claimId });
}

export async function updateSegment(segmentId: string, text: string) {
  return rpc("update_segment", { target_segment: segmentId, new_text: text });
}

export async function addComment(checkId: string, claimId: string | null, body: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  const text = body.trim();
  if (!text || text.length > 4000) return { ok: false, error: "errors.text_required" };
  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({ check_id: checkId, claim_id: claimId, user_id: viewer.id, body: text });
  if (error) return { ok: false, error: errorKey(error) };
  refresh();
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) return { ok: false, error: errorKey(error) };
  refresh();
  return { ok: true };
}

const detailsSchema = z.object({
  title: z.string().trim().min(1).max(300),
  deskId: z.string().uuid().nullable(),
  visibility: z.enum(["private", "desk", "newsroom"]),
});

/** Rename a check, move it to a desk, or change who sees it (its author, editors and admins). */
export async function updateCheckDetails(checkId: string, input: z.input<typeof detailsSchema>): Promise<ActionResult> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  const { title, deskId, visibility } = parsed.data;
  if (visibility === "desk" && !deskId) return { ok: false, error: "errors.desk_invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checks")
    .update({ title, desk_id: deskId, visibility })
    .eq("id", checkId)
    .select("id");
  if (error) return { ok: false, error: errorKey(error) };
  if (!data?.length) return { ok: false, error: "errors.not_allowed" };
  await expirePublicNote(checkId);
  refresh();
  return { ok: true };
}
