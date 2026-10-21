"use server";

import { randomUUID } from "node:crypto";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { sendInvitationEmail } from "@/features/invitations/email";
import { getViewer, isStaff, type Viewer } from "@/lib/auth";
import type { Database, Json } from "@/lib/database.types";
import { type ActionResult, errorKey } from "@/lib/errors";
import { isLocale } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/translate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  ACCESS_METHODS,
  ENTITY_KINDS,
  ENTITY_LEVELS,
  ESCALATING_TASKS,
  FREQUENCIES,
  MEASURES,
  modelChoices,
  OPTIONAL_TASKS,
  SCALES,
  SOURCE_TYPES,
  TEXT_MODELS,
  THINKING_LEVELS,
  UNIT_KINDS,
} from "./constants";
import { normalizeDomain } from "./domains";

// ─── Guards and errors ────────────────────────────────────────────────────────

async function staff(adminOnly = false): Promise<Viewer | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (adminOnly ? viewer.platformRole !== "admin" : !isStaff(viewer)) return null;
  return viewer;
}

const DENIED = { ok: false, error: "errors.not_allowed" } as const;

const CONSOLE_CODES = [
  "source_not_found",
  "source_not_active",
  "url_outside_source",
  "document_input_invalid",
  "title_required",
  "version_not_retryable",
  "proposal_not_found",
  "indicator_required",
  "figure_not_pending",
  "figure_not_found",
  "period_invalid",
  "fields_required",
  "indicator_not_found",
  "job_not_retryable",
  "job_duplicate",
  "job_not_cancellable",
  "model_settings_required_tasks_enabled",
] as const;

/** Console RPC errors to their messages; anything else goes through the shared mapping. */
function consoleError(error: { message?: string; code?: string } | null | undefined): MessageKey {
  if (error?.code === "23505") return "console.errors.duplicate";
  const message = error?.message ?? "";
  const code = CONSOLE_CODES.find((c) => message.includes(c));
  if (code === "model_settings_required_tasks_enabled") return "console.errors.task_required";
  return code ? (`console.errors.${code}` as MessageKey) : errorKey(error);
}

type LogArgs = Database["public"]["Functions"]["log_activity"]["Args"];

/** Platform-level activity: no newsroom (the generated types don't know these args take null). */
async function logStaff(action: string, kind: string, target: string | null, extra: Record<string, unknown> = {}) {
  const supabase = await createClient();
  await supabase.rpc("log_activity", { target_newsroom: null, action_name: action, target_kind: kind, target, extra: extra as Json } as unknown as LogArgs);
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown>, adminOnly = false): Promise<ActionResult<T>> {
  if (!(await staff(adminOnly))) return DENIED;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) return { ok: false, error: consoleError(error) };
  refresh();
  return { ok: true, data: data as T };
}

const optionalUrl = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "url");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

// ─── Sources ──────────────────────────────────────────────────────────────────

const sourceSchema = z.object({
  entityId: z.string().uuid().nullable(),
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
  tier: z.number().int().min(1).max(3),
  type: z.enum(SOURCE_TYPES),
  homepageUrl: optionalUrl,
  dataUrl: optionalUrl,
  domains: z.array(z.string()).min(1).max(20),
  accessMethods: z.array(z.enum(ACCESS_METHODS)).max(ACCESS_METHODS.length),
  updateFrequency: z.enum(FREQUENCIES).nullable(),
  languages: z.array(z.enum(["ar", "en"])).min(1),
  topicIds: z.array(z.string().uuid()).max(40),
  descriptionAr: optionalText(2000),
  descriptionEn: optionalText(2000),
  termsUrl: optionalUrl,
});

export type SourceInput = z.input<typeof sourceSchema>;

type SourceErrors = Partial<Record<"nameAr" | "nameEn" | "slug" | "domains" | "homepageUrl" | "dataUrl" | "termsUrl" | "tier" | "terms" | "firstDocument", MessageKey>>;

/** Validate a source, including the rules the database can't express. */
async function validateSource(input: SourceInput): Promise<{ ok: true; value: z.output<typeof sourceSchema> } | { ok: false; fields: SourceErrors }> {
  const parsed = sourceSchema.safeParse(input);
  const fields: SourceErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof SourceErrors;
      if (key && !fields[key]) fields[key] = `console.sources.errors.${key}` as MessageKey;
    }
    return { ok: false, fields };
  }
  const value = parsed.data;
  const domains = value.domains.map(normalizeDomain);
  if (domains.some((d) => d === null)) return { ok: false, fields: { domains: "console.sources.errors.domains" } };
  value.domains = [...new Set(domains as string[])];
  const inDomains = (url: string | null) => {
    if (!url) return true;
    const host = new URL(url).hostname.toLowerCase();
    return value.domains.some((d) => host === d || host.endsWith(`.${d}`));
  };
  if (!inDomains(value.homepageUrl)) fields.homepageUrl = "console.sources.errors.outsideDomains";
  if (!inDomains(value.dataUrl)) fields.dataUrl = "console.sources.errors.outsideDomains";
  if (value.entityId) {
    const supabase = await createClient();
    const { data: entity } = await supabase.from("entities").select("kind").eq("id", value.entityId).maybeSingle();
    // A news agency or media office relays what others publish: never an origin or issuer.
    if (entity && (entity.kind === "news_agency" || entity.kind === "media_office") && value.tier !== 3) fields.tier = "console.sources.errors.relayTier";
  }
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, value };
}

function sourceRow(value: z.output<typeof sourceSchema>) {
  return {
    entity_id: value.entityId,
    name_ar: value.nameAr,
    name_en: value.nameEn,
    tier: value.tier,
    type: value.type,
    homepage_url: value.homepageUrl,
    data_url: value.dataUrl,
    domains: value.domains,
    access_methods: value.accessMethods,
    update_frequency: value.updateFrequency,
    languages: value.languages,
    description_ar: value.descriptionAr,
    description_en: value.descriptionEn,
    terms_url: value.termsUrl,
  };
}

export async function createSource(
  input: SourceInput & { locale: string; termsConfirmed: boolean; firstDocument?: { title: string; url: string } | null },
): Promise<ActionResult & { fields?: SourceErrors }> {
  if (!(await staff())) return DENIED;
  const checked = await validateSource(input);
  if (!checked.ok) return { ok: false, error: "console.sources.errors.form", fields: checked.fields };
  if (!input.termsConfirmed) return { ok: false, error: "console.sources.errors.form", fields: { terms: "console.sources.errors.terms" } };
  const value = checked.value;
  const first = input.firstDocument?.url.trim() ? input.firstDocument : null;
  if (first) {
    const host = /^https?:\/\//i.test(first.url) ? new URL(first.url).hostname.toLowerCase() : "";
    if (!first.title.trim() || !value.domains.some((d) => host === d || host.endsWith(`.${d}`))) {
      return { ok: false, error: "console.sources.errors.form", fields: { firstDocument: "console.sources.errors.firstDocument" } };
    }
  }

  const supabase = await createClient();
  const id = randomUUID();
  const { error } = await supabase.from("sources").insert({ id, slug: value.slug, status: "active", verified_at: new Date().toISOString().slice(0, 10), ...sourceRow(value) });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "console.sources.errors.form", fields: { slug: "console.sources.errors.slugTaken" } };
    return { ok: false, error: consoleError(error) };
  }
  if (value.topicIds.length) await supabase.from("source_topics").insert(value.topicIds.map((topic_id) => ({ source_id: id, topic_id })));
  await logStaff("source.created", "source", id, { slug: value.slug });
  if (first) {
    await supabase.rpc("add_source_document", { target_source: id, doc_title: first.title.trim(), doc_url: first.url.trim() });
  }
  const locale = isLocale(input.locale) ? input.locale : "ar";
  redirect(`/${locale}/console/sources/${id}?created=1`);
}

export async function updateSource(id: string, input: SourceInput): Promise<ActionResult & { fields?: SourceErrors }> {
  if (!(await staff())) return DENIED;
  const checked = await validateSource(input);
  if (!checked.ok) return { ok: false, error: "console.sources.errors.form", fields: checked.fields };
  const value = checked.value;
  const supabase = await createClient();
  const { error } = await supabase.from("sources").update(sourceRow(value)).eq("id", id);
  if (error) return { ok: false, error: consoleError(error) };
  await supabase.from("source_topics").delete().eq("source_id", id);
  if (value.topicIds.length) await supabase.from("source_topics").insert(value.topicIds.map((topic_id) => ({ source_id: id, topic_id })));
  await logStaff("source.updated", "source", id);
  refresh();
  return { ok: true };
}

export async function setSourceStatus(id: string, status: "active" | "paused"): Promise<ActionResult> {
  if (!(await staff())) return DENIED;
  const supabase = await createClient();
  const { error } = await supabase.from("sources").update({ status }).eq("id", id).in("status", ["active", "paused"]);
  if (error) return { ok: false, error: consoleError(error) };
  await logStaff(status === "paused" ? "source.paused" : "source.resumed", "source", id);
  refresh();
  return { ok: true };
}

export async function fetchSourceNow(id: string) {
  return rpc<number>("fetch_source_now", { target_source: id });
}

const documentSchema = z.object({
  sourceId: z.string().uuid(),
  title: z.string().trim().min(2).max(500),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  language: z.enum(["ar", "en", "ar,en"]),
});

export async function addDocumentLink(input: z.input<typeof documentSchema> & { url: string }): Promise<ActionResult> {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "console.errors.title_required" };
  if (!/^https?:\/\/\S+$/i.test(input.url.trim())) return { ok: false, error: "errors.url_invalid" };
  return rpc("add_source_document", {
    target_source: parsed.data.sourceId,
    doc_title: parsed.data.title,
    doc_url: input.url.trim(),
    published: parsed.data.publishedAt,
    doc_language: parsed.data.language,
  });
}

// ─── Inbox uploads ────────────────────────────────────────────────────────────

const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "text/csv": ".csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "text/html": ".html",
  "text/plain": ".txt",
};
const EXTENSIONS = new Set(Object.values(DOCUMENT_TYPES).concat(".htm"));
const MAX_DOCUMENT = 100 * 1024 * 1024;

/** Step 1 of an inbox upload: a signed URL for a staging object the worker picks up. */
export async function createInboxUploadUrl(input: { name: string; size: number; type: string }): Promise<ActionResult<{ path: string; signedUrl: string }>> {
  if (!(await staff())) return DENIED;
  const ext = /\.[a-z0-9]{2,5}$/i.exec(input.name)?.[0].toLowerCase() ?? DOCUMENT_TYPES[input.type] ?? "";
  if (!EXTENSIONS.has(ext)) return { ok: false, error: "console.inbox.errors.type" };
  if (input.size <= 0 || input.size > MAX_DOCUMENT) return { ok: false, error: "console.inbox.errors.size" };
  // Keep the original name readable but safe for storage keys.
  const base = input.name.replace(/\.[^.]+$/, "").normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "document";
  const path = `inbox/${randomUUID()}/${base}${ext}`;
  const { data, error } = await createAdminClient().storage.from("documents").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "console.inbox.errors.upload" };
  return { ok: true, data: { path, signedUrl: data.signedUrl } };
}

/** Step 2: register the uploaded file with its source; the worker stores and extracts it. */
export async function registerUpload(input: z.input<typeof documentSchema> & { stagingPath: string }): Promise<ActionResult> {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "console.errors.title_required" };
  if (!/^inbox\/[0-9a-f-]{36}\/[^/]+$/.test(input.stagingPath)) return { ok: false, error: "console.errors.document_input_invalid" };
  return rpc("add_source_document", {
    target_source: parsed.data.sourceId,
    doc_title: parsed.data.title,
    staging_path: input.stagingPath,
    published: parsed.data.publishedAt,
    doc_language: parsed.data.language,
  });
}

export async function retryExtraction(versionId: string) {
  return rpc("retry_extraction", { target_version: versionId });
}

// ─── Figure review ────────────────────────────────────────────────────────────

export async function approveFigures(ids: string[]) {
  if (!ids.length) return { ok: true, data: 0 } as ActionResult<number>;
  return rpc<number>("approve_figures", { figure_ids: ids });
}

export async function rejectFigures(ids: string[], note?: string) {
  if (!ids.length) return { ok: true, data: 0 } as ActionResult<number>;
  return rpc<number>("reject_figures", { figure_ids: ids, note: note?.trim() || null });
}

const figureSchema = z.object({
  id: z.string().uuid(),
  indicatorId: z.string().uuid().nullable(),
  entityId: z.string().uuid().nullable(),
  value: z.string().trim().regex(/^-?\d+(\.\d+)?$/),
  scale: z.enum(SCALES),
  unit: z.string().trim().max(40),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodLabel: z.string().trim().min(1).max(80),
  geography: z.string().trim().min(2).max(60),
  breakdown: z.string().trim().max(120),
  measure: z.enum(MEASURES),
  status: z.enum(["preliminary", "final", "revised"]),
});

export type FigureInput = z.input<typeof figureSchema>;

export async function updateFigure(input: FigureInput): Promise<ActionResult> {
  const parsed = figureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "console.errors.fields_required" };
  const f = parsed.data;
  const decimals = f.value.includes(".") ? f.value.split(".")[1].length : 0;
  return rpc("update_figure", {
    target_figure: f.id,
    new_indicator: f.indicatorId,
    new_entity: f.entityId,
    new_value: f.value,
    new_scale: f.scale,
    new_decimals: decimals,
    new_unit: f.unit,
    new_period_start: f.periodStart,
    new_period_end: f.periodEnd,
    new_period_label: f.periodLabel,
    new_geography: f.geography,
    new_breakdown: f.breakdown,
    new_measure: f.measure,
    new_status: f.status,
  });
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const aliasList = z
  .array(z.string().trim().min(1).max(120))
  .max(60)
  .transform((list) => [...new Set(list)]);

const indicatorSchema = z.object({
  id: z.string().uuid().nullable(),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  topicId: z.string().uuid().nullable(),
  unitKind: z.enum(UNIT_KINDS),
  unit: z.string().trim().max(40),
  frequency: z.enum(FREQUENCIES).nullable(),
  defaultGeography: z.string().trim().min(2).max(60),
  aliases: aliasList,
  definitionAr: optionalText(2000),
  definitionEn: optionalText(2000),
});

export type IndicatorInput = z.input<typeof indicatorSchema>;

export async function saveIndicator(input: IndicatorInput, assignFigures: string[] = []): Promise<ActionResult<string>> {
  if (!(await staff())) return DENIED;
  const parsed = indicatorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "console.catalog.errors.form" };
  const v = parsed.data;
  const row = {
    slug: v.slug,
    name_ar: v.nameAr,
    name_en: v.nameEn,
    topic_id: v.topicId,
    unit_kind: v.unitKind,
    unit: v.unit,
    frequency: v.frequency,
    default_geography: v.defaultGeography,
    aliases: v.aliases,
    definition_ar: v.definitionAr,
    definition_en: v.definitionEn,
  };
  const supabase = await createClient();
  const id = v.id ?? randomUUID();
  const { error } = v.id ? await supabase.from("indicators").update(row).eq("id", v.id) : await supabase.from("indicators").insert({ id, ...row });
  if (error) return { ok: false, error: error.code === "23505" ? "console.catalog.errors.slugTaken" : consoleError(error) };
  if (assignFigures.length) {
    const { error: assignError } = await supabase.rpc("assign_indicator", { figure_ids: assignFigures, target_indicator: id });
    if (assignError) return { ok: false, error: consoleError(assignError) };
  }
  refresh();
  return { ok: true, data: id };
}

const entitySchema = z.object({
  id: z.string().uuid().nullable(),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  shortNameAr: optionalText(80),
  shortNameEn: optionalText(80),
  kind: z.enum(ENTITY_KINDS),
  level: z.enum(ENTITY_LEVELS),
  emirate: optionalText(60),
  website: optionalUrl,
  aliases: aliasList,
});

export type EntityInput = z.input<typeof entitySchema>;

export async function saveEntity(input: EntityInput): Promise<ActionResult<string>> {
  if (!(await staff())) return DENIED;
  const parsed = entitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "console.catalog.errors.form" };
  const v = parsed.data;
  const row = {
    slug: v.slug,
    name_ar: v.nameAr,
    name_en: v.nameEn,
    short_name_ar: v.shortNameAr,
    short_name_en: v.shortNameEn,
    kind: v.kind,
    level: v.level,
    emirate: v.emirate,
    website: v.website,
    aliases: v.aliases,
  };
  const supabase = await createClient();
  const id = v.id ?? randomUUID();
  const { error } = v.id ? await supabase.from("entities").update(row).eq("id", v.id) : await supabase.from("entities").insert({ id, ...row });
  if (error) return { ok: false, error: error.code === "23505" ? "console.catalog.errors.slugTaken" : consoleError(error) };
  refresh();
  return { ok: true, data: id };
}

// ─── Proposals ────────────────────────────────────────────────────────────────

export async function reviewSourceProposal(id: string, accept: boolean, note?: string) {
  return rpc("review_source_proposal", { target_source: id, accept, note: note?.trim() || null });
}

export async function dismissIndicatorProposal(figureIds: string[]) {
  return rpc<number>("dismiss_indicator_proposal", { figure_ids: figureIds });
}

// ─── Newsrooms ────────────────────────────────────────────────────────────────

/** Invite a newsroom's admin with the newsroom invitation flow (create_invitation + its email). */
async function inviteAdmin(newsroomId: string, email: string, fullName: string, locale: string): Promise<ActionResult<{ emailed: boolean }>> {
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invitation", {
    target_newsroom: newsroomId,
    invite_email: email,
    invite_name: fullName,
    invite_role: "admin",
  });
  if (error || !token) {
    if (error?.message.includes("already_member")) return { ok: false, error: "console.newsrooms.errors.alreadyMember" };
    return { ok: false, error: "console.newsrooms.errors.invite" };
  }
  const sent = await sendInvitationEmail({ email, fullName, locale: isLocale(locale) ? locale : "ar", token });
  return { ok: true, data: { emailed: sent === "sent" } };
}

const newsroomSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,59}$/),
  kind: z.enum(["newsroom", "issuer"]),
  monthlyCheckLimit: z.number().int().min(1).max(100_000).nullable(),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminName: z.string().trim().max(120),
  locale: z.string(),
});

export type NewsroomInput = z.input<typeof newsroomSchema>;

export async function createNewsroom(input: NewsroomInput): Promise<ActionResult<{ emailed: boolean }>> {
  if (!(await staff(true))) return DENIED;
  const parsed = newsroomSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "console.newsrooms.errors.form" };
  const v = parsed.data;
  const supabase = await createClient();
  const id = randomUUID();
  const { error } = await supabase.from("newsrooms").insert({ id, name: v.name, slug: v.slug, kind: v.kind, monthly_check_limit: v.monthlyCheckLimit });
  if (error) return { ok: false, error: error.code === "23505" ? "console.newsrooms.errors.slugTaken" : consoleError(error) };
  await supabase.rpc("log_activity", { target_newsroom: id, action_name: "newsroom.created", target_kind: "newsroom", target: id, extra: { slug: v.slug } });
  const invited = await inviteAdmin(id, v.adminEmail, v.adminName, v.locale);
  refresh();
  // The newsroom exists either way; a failed invitation is re-sent from its row.
  return invited.ok ? invited : { ok: true, data: { emailed: false } };
}

export async function inviteNewsroomAdmin(newsroomId: string, email: string, name: string, locale: string): Promise<ActionResult<{ emailed: boolean }>> {
  if (!(await staff(true))) return DENIED;
  const parsed = z.string().trim().toLowerCase().email().safeParse(email);
  if (!parsed.success) return { ok: false, error: "console.newsrooms.errors.form" };
  const invited = await inviteAdmin(newsroomId, parsed.data, name.trim(), locale);
  refresh();
  return invited;
}

export async function updateNewsroom(id: string, patch: { monthlyCheckLimit: number | null; status: "active" | "suspended" }): Promise<ActionResult> {
  if (!(await staff(true))) return DENIED;
  const limit = patch.monthlyCheckLimit;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100_000)) return { ok: false, error: "console.newsrooms.errors.form" };
  const supabase = await createClient();
  const { error } = await supabase.from("newsrooms").update({ monthly_check_limit: limit, status: patch.status }).eq("id", id);
  if (error) return { ok: false, error: consoleError(error) };
  await supabase.rpc("log_activity", { target_newsroom: id, action_name: "newsroom.updated", target_kind: "newsroom", target: id, extra: { monthly_check_limit: limit, status: patch.status } });
  refresh();
  return { ok: true };
}

// ─── Quality and models ───────────────────────────────────────────────────────

const settingSchema = z.object({
  task: z.string().min(2).max(60),
  model: z.string().min(2).max(80),
  effort: z.enum(THINKING_LEVELS),
  escalationModel: z.string().min(2).max(80).nullable(),
  maxTokens: z.number().int().min(256).max(128_000).nullable(),
  enabled: z.boolean(),
});

export async function updateModelSetting(input: z.input<typeof settingSchema>): Promise<ActionResult> {
  const viewer = await staff(true);
  if (!viewer) return DENIED;
  const parsed = settingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "console.quality.errors.form" };
  const v = parsed.data;
  const supabase = await createClient();
  const { data: current } = await supabase.from("model_settings").select("task").eq("task", v.task).maybeSingle();
  if (!current) return { ok: false, error: "console.quality.errors.form" };
  if (!modelChoices(v.task).includes(v.model)) return { ok: false, error: "console.quality.errors.model" };
  const escalates = (ESCALATING_TASKS as readonly string[]).includes(v.task);
  const escalationModel = escalates ? v.escalationModel : null;
  if (escalationModel && (escalationModel === v.model || !(TEXT_MODELS as readonly string[]).includes(escalationModel))) {
    return { ok: false, error: "console.quality.errors.model" };
  }
  if (!v.enabled && !(OPTIONAL_TASKS as readonly string[]).includes(v.task)) return { ok: false, error: "console.errors.task_required" };
  const { error } = await supabase
    .from("model_settings")
    .update({
      model: v.model,
      effort: v.effort,
      escalation_model: escalationModel,
      max_tokens: v.maxTokens,
      enabled: v.enabled,
      updated_by: viewer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("task", v.task);
  if (error) return { ok: false, error: consoleError(error) };
  await logStaff("model.updated", "model_setting", null, {
    task: v.task,
    model: v.model,
    effort: v.effort,
    escalation_model: escalationModel,
    enabled: v.enabled,
  });
  refresh();
  return { ok: true };
}

export async function runEval(dataset = "uae-corpus"): Promise<ActionResult> {
  const viewer = await staff();
  if (!viewer) return DENIED;
  const supabase = await createClient();
  const { data: open } = await supabase.from("eval_runs").select("id").in("status", ["queued", "running"]).limit(1);
  if (open?.length) return { ok: false, error: "console.quality.errors.running" };
  const { data: settings } = await supabase.from("model_settings").select("task, model, effort, escalation_model, enabled");
  const { error } = await supabase.from("eval_runs").insert({
    dataset,
    started_by: viewer.id,
    status: "queued",
    settings: Object.fromEntries(
      (settings ?? []).map((s) => [s.task, { model: s.model, effort: s.effort, escalation: s.escalation_model, enabled: s.enabled }]),
    ),
  });
  if (error) return { ok: false, error: consoleError(error) };
  refresh();
  return { ok: true };
}

// ─── System ───────────────────────────────────────────────────────────────────

export async function retryJob(id: number) {
  return rpc("retry_job", { target_job: id });
}

export async function cancelJob(id: number) {
  return rpc("cancel_job", { target_job: id });
}
