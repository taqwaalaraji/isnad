import "server-only";

import { createClient } from "@/lib/supabase/server";
import { likePattern } from "@/lib/text";

export const CONSOLE_PAGE_SIZE = 25;

// ─── Official sources ─────────────────────────────────────────────────────────

export type SourceFilter = "all" | "tier1" | "tier2" | "tier3" | "warnings" | "paused";
export const SOURCE_FILTERS: SourceFilter[] = ["all", "tier1", "tier2", "tier3", "warnings", "paused"];

const SOURCE_FIELDS =
  "id, slug, name_ar, name_en, tier, type, domains, access_methods, update_frequency, status, health, health_note, last_fetched_at, entity:entities(id, name_ar, name_en, kind), documents(count)";

/** The shared registry's sources (newsroom-private sources and proposals live elsewhere). */
export async function listSources({ filter, q, page }: { filter: SourceFilter; q?: string; page: number }) {
  const supabase = await createClient();
  let query = supabase.from("sources").select(SOURCE_FIELDS, { count: "exact" }).is("newsroom_id", null).in("status", ["active", "paused"]);
  if (filter === "tier1" || filter === "tier2" || filter === "tier3") query = query.eq("tier", Number(filter.slice(4)));
  if (filter === "warnings") query = query.in("health", ["warning", "failing"]);
  if (filter === "paused") query = query.eq("status", "paused");
  if (q?.trim()) query = query.ilike("search_text", likePattern(q));
  const from = (page - 1) * CONSOLE_PAGE_SIZE;
  const { data, count, error } = await query.order("tier").order("name_ar").range(from, from + CONSOLE_PAGE_SIZE - 1);
  if (error) throw error;

  // Figure counts per source in one query (approved figures only).
  const ids = (data ?? []).map((s) => s.id);
  const figures = new Map<string, number>();
  if (ids.length) {
    const { data: rows } = await supabase.from("figures").select("source_id").in("source_id", ids).eq("review_status", "approved").limit(10000);
    for (const row of rows ?? []) figures.set(row.source_id, (figures.get(row.source_id) ?? 0) + 1);
  }
  return {
    rows: (data ?? []).map((s) => ({ ...s, documentCount: s.documents?.[0]?.count ?? 0, figureCount: figures.get(s.id) ?? 0 })),
    total: count ?? 0,
  };
}

export type SourceListRow = Awaited<ReturnType<typeof listSources>>["rows"][number];

export async function sourceFilterCounts() {
  const supabase = await createClient();
  const base = () => supabase.from("sources").select("id", { count: "exact", head: true }).is("newsroom_id", null).in("status", ["active", "paused"]);
  const [all, t1, t2, t3, warnings, paused] = await Promise.all([
    base(),
    base().eq("tier", 1),
    base().eq("tier", 2),
    base().eq("tier", 3),
    base().in("health", ["warning", "failing"]),
    base().eq("status", "paused"),
  ]);
  return {
    all: all.count ?? 0,
    tier1: t1.count ?? 0,
    tier2: t2.count ?? 0,
    tier3: t3.count ?? 0,
    warnings: warnings.count ?? 0,
    paused: paused.count ?? 0,
  };
}

/** The first warning to surface above the table. */
export async function sourceWarning() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sources")
    .select("id, name_ar, name_en, health_note")
    .is("newsroom_id", null)
    .in("health", ["warning", "failing"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getSource(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sources")
    .select("*, entity:entities(id, name_ar, name_en, kind), source_topics(topic_id)")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function sourceDocuments(sourceId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, title, url, kind, watch, published_at, updated_at, current:document_versions!documents_current_version_fk(id, version, fetched_at, extraction_status, figures_count)")
    .eq("source_id", sourceId)
    .order("updated_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function formOptions() {
  const supabase = await createClient();
  const [entities, topics] = await Promise.all([
    supabase.from("entities").select("id, name_ar, name_en, kind").order("name_ar").limit(1000),
    supabase.from("topics").select("id, slug, name_ar, name_en").order("sort_order"),
  ]);
  return { entities: entities.data ?? [], topics: topics.data ?? [] };
}

export type FormOptions = Awaited<ReturnType<typeof formOptions>>;

/** Active shared sources for pickers (inbox upload, add a link). */
export async function sourceOptions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sources")
    .select("id, name_ar, name_en, tier, domains")
    .is("newsroom_id", null)
    .eq("status", "active")
    .order("tier")
    .order("name_ar")
    .limit(1000);
  return data ?? [];
}

export type SourceOption = Awaited<ReturnType<typeof sourceOptions>>[number];

// ─── Inbox ────────────────────────────────────────────────────────────────────

export type InboxFilter = "all" | "extracting" | "review" | "failed" | "done";
export const INBOX_FILTERS: InboxFilter[] = ["all", "review", "extracting", "failed", "done"];

const VERSION_FIELDS =
  "id, version, mime_type, size_bytes, page_count, fetched_at, fetched_via, extraction_status, extraction_error, figures_count, document:documents!document_versions_document_id_fkey(id, title, url, kind, source:sources(id, name_ar, name_en)), fetcher:profiles(full_name)";

export async function listInbox({ filter, page }: { filter: InboxFilter; page: number }) {
  const supabase = await createClient();
  let query = supabase.from("document_versions").select(VERSION_FIELDS, { count: "exact" });
  if (filter === "extracting") query = query.in("extraction_status", ["pending", "extracting"]);
  else if (filter === "failed") query = query.eq("extraction_status", "failed");
  else if (filter === "done") query = query.in("extraction_status", ["extracted", "unchanged"]);
  const from = (page - 1) * CONSOLE_PAGE_SIZE;
  const { data, count, error } = await query.order("fetched_at", { ascending: false }).range(from, from + CONSOLE_PAGE_SIZE - 1);
  if (error) throw error;

  // Pending figures per version, to show "N awaiting review".
  const ids = (data ?? []).map((v) => v.id);
  const pending = new Map<string, number>();
  if (ids.length) {
    const { data: rows } = await supabase.from("figures").select("document_version_id").in("document_version_id", ids).eq("review_status", "pending").limit(10000);
    for (const row of rows ?? []) pending.set(row.document_version_id, (pending.get(row.document_version_id) ?? 0) + 1);
  }
  let rows = (data ?? []).map((v) => ({ ...v, pendingFigures: pending.get(v.id) ?? 0 }));
  if (filter === "review") rows = rows.filter((r) => r.pendingFigures > 0);
  return { rows, total: count ?? 0 };
}

export type InboxRow = Awaited<ReturnType<typeof listInbox>>["rows"][number];

export async function inboxMetrics() {
  const supabase = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [pending, extracting, approvedWeek, failed] = await Promise.all([
    supabase.from("figures").select("document_version_id", { count: "exact" }).eq("review_status", "pending").limit(10000),
    supabase.from("document_versions").select("id, document:documents!document_versions_document_id_fkey(title)", { count: "exact" }).in("extraction_status", ["pending", "extracting"]).limit(1),
    supabase.from("figures").select("document_version_id", { count: "exact" }).eq("review_status", "approved").gte("reviewed_at", weekAgo).limit(10000),
    supabase.from("document_versions").select("id", { count: "exact", head: true }).eq("extraction_status", "failed"),
  ]);
  return {
    pending: pending.count ?? 0,
    pendingFiles: new Set((pending.data ?? []).map((r) => r.document_version_id)).size,
    extracting: extracting.count ?? 0,
    extractingTitle: extracting.data?.[0]?.document?.title ?? null,
    approvedWeek: approvedWeek.count ?? 0,
    approvedWeekFiles: new Set((approvedWeek.data ?? []).map((r) => r.document_version_id)).size,
    failed: failed.count ?? 0,
  };
}

// ─── Figure review ────────────────────────────────────────────────────────────

const REVIEW_FIELDS =
  "id, value, scale, decimals, unit, measure, period_start, period_end, period_label, geography, breakdown, status, location, quote, quote_verified, review_note, created_at, indicator_id, entity_id, document_version_id, indicator:indicators(id, name_ar, name_en, unit), entity:entities(id, name_ar, name_en), source:sources(id, name_ar, name_en, tier), document:documents(id, title, url, kind)";

/** Pending figures, oldest first, optionally from one document version. */
export async function reviewQueue({ version }: { version?: string }) {
  const supabase = await createClient();
  let query = supabase.from("figures").select(REVIEW_FIELDS, { count: "exact" }).eq("review_status", "pending");
  if (version) query = query.eq("document_version_id", version);
  const { data, count, error } = await query.order("document_version_id").order("created_at").limit(200);
  if (error) throw error;
  return { figures: data ?? [], total: count ?? 0 };
}

export type ReviewFigure = Awaited<ReturnType<typeof reviewQueue>>["figures"][number];

/** Files with figures awaiting review, oldest first, with their pending counts. */
export async function reviewFiles() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("figures")
    .select("document_version_id, created_at, document:documents(title)")
    .eq("review_status", "pending")
    .order("created_at")
    .limit(10000);
  const files = new Map<string, { id: string; title: string; count: number }>();
  for (const row of data ?? []) {
    const file = files.get(row.document_version_id) ?? { id: row.document_version_id, title: row.document?.title ?? "", count: 0 };
    file.count += 1;
    files.set(row.document_version_id, file);
  }
  return [...files.values()];
}

/**
 * The stored text and tables of the versions under review, trimmed to what the reviewer needs:
 * the passage around each quote, and the sheet holding each cell.
 */
export async function versionContexts(versionIds: string[]): Promise<Record<string, VersionContext>> {
  if (!versionIds.length) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("document_versions").select("id, version, text_content, tables, page_count").in("id", versionIds);
  const out: Record<string, VersionContext> = {};
  for (const row of data ?? []) {
    const tables = (row.tables ?? []) as Array<{ kind: string; sheet?: string; cells?: Record<string, unknown>; pages?: string[] }>;
    out[row.id] = {
      version: row.version,
      text: row.text_content ?? "",
      pages: tables.find((t) => t.kind === "pdf_pages")?.pages ?? null,
      sheets: tables.filter((t) => t.kind === "sheet").map((t) => ({ sheet: t.sheet ?? "", cells: t.cells ?? {} })),
    };
  }
  return out;
}

export type VersionContext = { version: number; text: string; pages: string[] | null; sheets: Array<{ sheet: string; cells: Record<string, unknown> }> };

export async function catalogOptions() {
  const supabase = await createClient();
  const [indicators, entities, topics] = await Promise.all([
    supabase.from("indicators").select("id, slug, name_ar, name_en, unit, topic_id").order("name_ar").limit(2000),
    supabase.from("entities").select("id, slug, name_ar, name_en").order("name_ar").limit(2000),
    supabase.from("topics").select("id, slug, name_ar, name_en").order("sort_order"),
  ]);
  return { indicators: indicators.data ?? [], entities: entities.data ?? [], topics: topics.data ?? [] };
}

export type CatalogOptions = Awaited<ReturnType<typeof catalogOptions>>;

// ─── Catalog ──────────────────────────────────────────────────────────────────

export async function listIndicators(q?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("indicators")
    .select("id, slug, name_ar, name_en, aliases, definition_ar, definition_en, unit_kind, unit, frequency, default_geography, topic_id, topic:topics(name_ar, name_en)")
    .order("name_ar")
    .limit(500);
  if (q?.trim()) query = query.ilike("search_text", likePattern(q));
  const { data, error } = await query;
  if (error) throw error;
  const ids = (data ?? []).map((i) => i.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: rows } = await supabase.from("figures").select("indicator_id").in("indicator_id", ids).eq("review_status", "approved").limit(20000);
    for (const row of rows ?? []) if (row.indicator_id) counts.set(row.indicator_id, (counts.get(row.indicator_id) ?? 0) + 1);
  }
  return (data ?? []).map((i) => ({ ...i, figureCount: counts.get(i.id) ?? 0 }));
}

export type IndicatorRow = Awaited<ReturnType<typeof listIndicators>>[number];

export async function listEntities(q?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("entities")
    .select("id, slug, name_ar, name_en, short_name_ar, short_name_en, kind, level, emirate, website, aliases, sources(count)")
    .order("name_ar")
    .limit(500);
  if (q?.trim()) query = query.ilike("search_text", likePattern(q));
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((e) => ({ ...e, sourceCount: e.sources?.[0]?.count ?? 0 }));
}

export type EntityRow = Awaited<ReturnType<typeof listEntities>>[number];

export async function catalogCounts() {
  const supabase = await createClient();
  const [indicators, entities] = await Promise.all([
    supabase.from("indicators").select("id", { count: "exact", head: true }),
    supabase.from("entities").select("id", { count: "exact", head: true }),
  ]);
  return { indicators: indicators.count ?? 0, entities: entities.count ?? 0 };
}

// ─── Proposals ────────────────────────────────────────────────────────────────

export async function sourceProposals() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sources")
    .select("id, name_ar, name_en, tier, domains, homepage_url, data_url, proposal_note, created_at, newsroom:newsrooms(name), proposer:profiles!sources_proposed_by_fkey(full_name, email), entity:entities(name_ar, name_en)")
    .eq("status", "proposed")
    .order("created_at");
  return data ?? [];
}

export type SourceProposal = Awaited<ReturnType<typeof sourceProposals>>[number];

/** Figures the extractor couldn't place in the catalog, grouped by the indicator it proposed. */
export async function indicatorProposals() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("figures")
    .select("id, review_note, value, scale, decimals, unit, period_label, quote, source:sources(name_ar, name_en)")
    .eq("review_status", "pending")
    .is("indicator_id", null)
    .like("review_note", "proposed indicator:%")
    .order("created_at")
    .limit(500);
  const groups = new Map<string, { note: string; parsed: ProposedIndicator; figures: NonNullable<typeof data> }>();
  for (const row of data ?? []) {
    const note = row.review_note ?? "";
    const group = groups.get(note) ?? { note, parsed: parseProposal(note), figures: [] };
    group.figures.push(row);
    groups.set(note, group);
  }
  return [...groups.values()];
}

export type IndicatorProposal = Awaited<ReturnType<typeof indicatorProposals>>[number];

export type ProposedIndicator = { nameAr: string; nameEn: string; unit: string; topic: string };

/** "proposed indicator: name_ar / name_en (unit, topic)", as written by the worker's ingestion. */
export function parseProposal(note: string): ProposedIndicator {
  const body = note.replace(/^proposed indicator:\s*/, "");
  const match = /^(.*?)\s*\/\s*(.*?)\s*\(([^,()]*),\s*([^()]*)\)\s*$/.exec(body);
  if (!match) return { nameAr: body, nameEn: "", unit: "", topic: "" };
  return { nameAr: match[1], nameEn: match[2], unit: match[3].trim(), topic: match[4].trim() };
}

// ─── Newsrooms ────────────────────────────────────────────────────────────────

export async function listNewsrooms() {
  const supabase = await createClient();
  const [{ data: rooms }, { data: stats }, { data: admins }, { data: invites }] = await Promise.all([
    supabase.from("newsrooms").select("id, name, slug, kind, status, monthly_check_limit, created_at").eq("internal", false).order("created_at"),
    supabase.rpc("console_newsroom_stats"),
    supabase.from("memberships").select("newsroom_id, role, profile:profiles(full_name, email)").eq("role", "admin").eq("status", "active"),
    supabase.from("invitations").select("newsroom_id, email, created_at").eq("role", "admin").is("accepted_at", null).is("revoked_at", null),
  ]);
  const byId = new Map((stats ?? []).map((s) => [s.newsroom_id, s]));
  return (rooms ?? []).map((room) => {
    const s = byId.get(room.id);
    const admin = (admins ?? []).find((a) => a.newsroom_id === room.id)?.profile ?? null;
    const invited = (invites ?? []).find((i) => i.newsroom_id === room.id)?.email ?? null;
    return {
      ...room,
      members: s?.members ?? 0,
      checksThisMonth: s?.checks_this_month ?? 0,
      mediaMinutes: Number(s?.media_minutes_this_month ?? 0),
      costThisMonth: Number(s?.cost_this_month ?? 0),
      admin,
      invitedAdmin: invited,
    };
  });
}

export type NewsroomRow = Awaited<ReturnType<typeof listNewsrooms>>[number];

// ─── Quality and models ───────────────────────────────────────────────────────

export async function modelSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("model_settings").select("*, editor:profiles(full_name)").order("task");
  return data ?? [];
}

export type ModelSettingRow = Awaited<ReturnType<typeof modelSettings>>[number];

export async function evalRuns() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("eval_runs")
    .select("id, status, dataset, settings, metrics, error, created_at, finished_at, starter:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

export type EvalRunRow = Awaited<ReturnType<typeof evalRuns>>[number];

export async function usageSummary(days = 30) {
  const supabase = await createClient();
  const [{ data: usage }, { data: costs }] = await Promise.all([supabase.rpc("console_usage", { days }), supabase.rpc("console_check_costs")]);
  return { usage: usage ?? [], checkCosts: costs ?? [] };
}

// ─── System ───────────────────────────────────────────────────────────────────

export async function jobOverview() {
  const supabase = await createClient();
  const [{ data: stats }, { data: failures }, { data: latest }, { data: running }, { data: queued }] = await Promise.all([
    supabase.rpc("console_job_stats"),
    supabase
      .from("jobs")
      .select("id, kind, status, attempts, max_attempts, last_error, created_at, finished_at, payload")
      .in("status", ["failed", "cancelled"])
      .order("id", { ascending: false })
      .limit(25),
    supabase.from("jobs").select("started_at, finished_at, locked_by").not("started_at", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("jobs").select("id, kind, started_at, locked_by, attempts").eq("status", "running").order("started_at").limit(20),
    supabase.from("jobs").select("id, kind, created_at, run_after, attempts, priority").eq("status", "queued").order("priority", { ascending: false }).order("id").limit(20),
  ]);
  const lastActivity = latest ? [latest.finished_at, latest.started_at].filter((v): v is string => !!v).sort().at(-1) ?? null : null;
  // Quiet: no job started or finished in the last 30 minutes (the daily watch keeps a live worker busy).
  const quiet = !lastActivity || Date.now() - new Date(lastActivity).getTime() > 30 * 60_000;
  return { stats: stats ?? [], failures: failures ?? [], lastActivity, quiet, running: running ?? [], queued: queued ?? [] };
}

export type JobFailure = Awaited<ReturnType<typeof jobOverview>>["failures"][number];
