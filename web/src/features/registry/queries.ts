import "server-only";

import type { Viewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { granularity, type Granularity } from "./format";
import type { FigureExcerpt, RegistryStats, SearchResults } from "./types";

type ActiveViewer = Viewer & { active: NonNullable<Viewer["active"]> };

const FIGURE_FIELDS =
  "id, value, scale, decimals, unit, value_base, measure, period_start, period_end, period_label, geography, breakdown, status, is_current, supersedes_id, quote, location, published_at, created_at, document_id, document_version_id, indicator_id, entity_id, source:sources(id, slug, name_ar, name_en, tier, entity_id), document:documents(id, title, url, kind, published_at), version:document_versions(id, version, fetched_at)";

/** One-to-one embeds may come back as an object or a one-element list. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string | undefined | null): value is string => !!value && UUID.test(value);

// ─── Overview ────────────────────────────────────────────────────────────────

export async function registryStats(): Promise<RegistryStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registry_stats");
  if (error) throw error;
  return data as unknown as RegistryStats;
}

export async function topicStats() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registry_topic_stats");
  if (error) throw error;
  return data ?? [];
}

export type TopicStat = Awaited<ReturnType<typeof topicStats>>[number];

export async function searchRegistry(query: string): Promise<SearchResults> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registry_search", { query, max_rows: 8 });
  if (error) throw error;
  return data as unknown as SearchResults;
}

/** The latest current level figure for each indicator, for result rows and topic pages. */
export async function latestByIndicator(indicatorIds: string[]) {
  if (indicatorIds.length === 0) return new Map<string, FigureRow>();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("figures")
    .select(FIGURE_FIELDS)
    .in("indicator_id", indicatorIds)
    .eq("is_current", true)
    .eq("measure", "level")
    .order("period_end", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.max(50, indicatorIds.length * 20));
  if (error) throw error;
  const latest = new Map<string, FigureRow>();
  for (const row of (data ?? []).map(normalizeFigure)) {
    if (row.indicator_id && !latest.has(row.indicator_id)) latest.set(row.indicator_id, row);
  }
  return latest;
}

/** Sparkline series (base values over time) for indicator + geography pairs. */
async function seriesFor(pairs: Array<{ indicatorId: string; geography: string; granularity: Granularity }>) {
  const ids = [...new Set(pairs.map((p) => p.indicatorId))];
  const series = new Map<string, number[]>();
  if (ids.length === 0) return series;
  const supabase = await createClient();
  const { data } = await supabase
    .from("figures")
    .select("indicator_id, geography, value_base, period_start, period_end, breakdown")
    .in("indicator_id", ids)
    .eq("is_current", true)
    .eq("measure", "level")
    .is("breakdown", null)
    .order("period_end", { ascending: true })
    .limit(2000);
  for (const pair of pairs) {
    const byPeriod = new Map<string, number>();
    for (const r of data ?? []) {
      if (r.indicator_id !== pair.indicatorId || r.geography !== pair.geography) continue;
      if (granularity(r.period_start, r.period_end) !== pair.granularity) continue;
      byPeriod.set(`${r.period_start}:${r.period_end}`, Number(r.value_base));
    }
    series.set(`${pair.indicatorId}:${pair.geography}`, [...byPeriod.values()].slice(-12));
  }
  return series;
}

/** The most recently added figures, one per indicator and scope, each with its trend. */
export async function latestFigures(limit = 6) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("figures")
    .select(`${FIGURE_FIELDS}, indicator:indicators(slug, name_ar, name_en, frequency), entity:entities(name_ar, name_en, short_name_ar, short_name_en)`)
    .eq("is_current", true)
    .not("indicator_id", "is", null)
    .is("breakdown", null)
    .order("created_at", { ascending: false })
    .order("period_end", { ascending: false })
    .limit(300);
  if (error) throw error;
  const seen = new Set<string>();
  const picked = [];
  for (const raw of data ?? []) {
    const row = { ...normalizeFigure(raw), indicator: one(raw.indicator), entity: one(raw.entity) };
    const key = `${row.indicator_id}:${row.geography}:${row.measure}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(row);
    if (picked.length >= limit) break;
  }
  const series = await seriesFor(
    picked
      .filter((r) => r.measure === "level")
      .map((r) => ({ indicatorId: r.indicator_id!, geography: r.geography, granularity: granularity(r.period_start, r.period_end) })),
  );
  return picked.map((r) => ({ ...r, series: series.get(`${r.indicator_id}:${r.geography}`) ?? [] }));
}

export type LatestFigure = Awaited<ReturnType<typeof latestFigures>>[number];

function normalizeFigure<T extends { source: unknown; document: unknown; version: unknown }>(row: T) {
  return {
    ...row,
    source: one(row.source as FigureSource | FigureSource[] | null),
    document: one(row.document as FigureDocument | FigureDocument[] | null),
    version: one(row.version as FigureVersion | FigureVersion[] | null),
  } as Omit<T, "source" | "document" | "version"> & { source: FigureSource | null; document: FigureDocument | null; version: FigureVersion | null };
}

type FigureSource = { id: string; slug: string; name_ar: string; name_en: string; tier: number; entity_id: string | null };
type FigureDocument = { id: string; title: string; url: string | null; kind: string; published_at: string | null };
type FigureVersion = { id: string; version: number; fetched_at: string };

export type FigureRow = {
  id: string;
  value: number;
  scale: string;
  decimals: number;
  unit: string;
  value_base: number;
  measure: string;
  period_start: string;
  period_end: string;
  period_label: string;
  geography: string;
  breakdown: string | null;
  status: "preliminary" | "final" | "revised";
  is_current: boolean;
  supersedes_id: string | null;
  quote: string;
  location: unknown;
  published_at: string | null;
  created_at: string;
  document_id: string;
  document_version_id: string;
  indicator_id: string | null;
  entity_id: string | null;
  source: FigureSource | null;
  document: FigureDocument | null;
  version: FigureVersion | null;
};

// ─── Topics ──────────────────────────────────────────────────────────────────

export async function getTopic(slug: string) {
  const supabase = await createClient();
  const { data: topic } = await supabase.from("topics").select("id, slug, name_ar, name_en, icon").eq("slug", slug).maybeSingle();
  if (!topic) return null;
  const [indicators, sources] = await Promise.all([
    supabase.from("indicators").select("id, slug, name_ar, name_en, unit, frequency, default_geography").eq("topic_id", topic.id).order("name_en"),
    supabase
      .from("source_topics")
      .select("source:sources!inner(id, slug, name_ar, name_en, tier, status, last_fetched_at, update_frequency, entity:entities(slug, name_ar, name_en))")
      .eq("topic_id", topic.id)
      .eq("source.status", "active"),
  ]);
  const rows = indicators.data ?? [];
  const latest = await latestByIndicator(rows.map((i) => i.id));
  const series = await seriesFor(
    [...latest.values()].map((f) => ({ indicatorId: f.indicator_id!, geography: f.geography, granularity: granularity(f.period_start, f.period_end) })),
  );
  return {
    topic,
    indicators: rows.map((i) => {
      const figure = latest.get(i.id) ?? null;
      return { ...i, figure, series: figure ? (series.get(`${i.id}:${figure.geography}`) ?? []) : [] };
    }),
    sources: (sources.data ?? [])
      .map((s) => one(s.source))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ ...s, entity: one(s.entity) }))
      .sort((a, b) => a.tier - b.tier || a.name_en.localeCompare(b.name_en)),
  };
}

// ─── Indicator ───────────────────────────────────────────────────────────────

export async function getIndicator(viewer: ActiveViewer, slug: string) {
  const supabase = await createClient();
  const { data: indicator } = await supabase
    .from("indicators")
    .select("id, slug, name_ar, name_en, definition_ar, definition_en, unit, unit_kind, frequency, default_geography, aliases, topic:topics(slug, name_ar, name_en, icon)")
    .eq(isUuid(slug) ? "id" : "slug", slug) // alerts and briefs link by id
    .maybeSingle();
  if (!indicator) return null;

  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const [figures, claims, follow] = await Promise.all([
    supabase
      .from("figures")
      .select(FIGURE_FIELDS)
      .eq("indicator_id", indicator.id)
      .order("period_end", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("claims")
      .select("id, span_text, created_at, result:claim_results(verdict, differing_fields), check:checks!inner(id, title, newsroom_id)")
      .eq("indicator_id", indicator.id)
      .eq("check.newsroom_id", viewer.active.newsroomId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("follows").select("user_id").eq("user_id", viewer.id).eq("target_type", "indicator").eq("target_id", indicator.id).maybeSingle(),
  ]);
  if (figures.error) throw figures.error;

  const citations = (claims.data ?? []).map((c) => ({ ...c, result: one(c.result), check: one(c.check) }));
  return {
    indicator: { ...indicator, topic: one(indicator.topic) },
    figures: (figures.data ?? []).map(normalizeFigure) as FigureRow[],
    citations,
    citationsThisYear: citations.filter((c) => c.created_at >= yearStart).length,
    following: !!follow.data,
  };
}

export type IndicatorPage = NonNullable<Awaited<ReturnType<typeof getIndicator>>>;

// ─── Entity ──────────────────────────────────────────────────────────────────

export async function getEntity(viewer: ActiveViewer, slug: string) {
  const supabase = await createClient();
  const { data: entity } = await supabase
    .from("entities")
    .select("id, slug, name_ar, name_en, short_name_ar, short_name_en, kind, level, emirate, website, description_ar, description_en")
    .eq(isUuid(slug) ? "id" : "slug", slug) // alerts and briefs link by id
    .maybeSingle();
  if (!entity) return null;

  const { data: sources } = await supabase
    .from("sources")
    .select("id, slug, name_ar, name_en, tier, homepage_url, last_fetched_at, update_frequency, status")
    .eq("entity_id", entity.id)
    .order("tier");
  const sourceIds = (sources ?? []).map((s) => s.id);
  const sourceFilter = sourceIds.length ? `,source_id.in.(${sourceIds.join(",")})` : "";

  const [figures, documents, claims, follow] = await Promise.all([
    supabase
      .from("figures")
      .select(`${FIGURE_FIELDS}, indicator:indicators(id, slug, name_ar, name_en, topic:topics(slug, name_ar, name_en))`)
      .or(`entity_id.eq.${entity.id}${sourceFilter}`)
      .order("created_at", { ascending: false })
      .limit(400),
    sourceIds.length
      ? supabase
          .from("documents")
          .select("id, title, kind, url, published_at, created_at, source_id, version:document_versions!documents_current_version_fk(version, fetched_at, figures_count, page_count)")
          .in("source_id", sourceIds)
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("claims")
      .select("id, indicator:indicators(id, slug, name_ar, name_en), check:checks!inner(newsroom_id)")
      .eq("entity_id", entity.id)
      .eq("check.newsroom_id", viewer.active.newsroomId)
      .limit(500),
    supabase.from("follows").select("user_id").eq("user_id", viewer.id).eq("target_type", "entity").eq("target_id", entity.id).maybeSingle(),
  ]);
  if (figures.error) throw figures.error;

  const rows = (figures.data ?? []).map((raw) => {
    const indicator = one(raw.indicator);
    return { ...(normalizeFigure(raw) as unknown as FigureRow), indicator: indicator ? { ...indicator, topic: one(indicator.topic) } : null };
  });
  // Values of superseded figures, so revisions can show "from → to".
  const missing = rows.map((r) => r.supersedes_id).filter((id): id is string => !!id && !rows.some((r) => r.id === id));
  const previous = missing.length
    ? ((await supabase.from("figures").select("id, value, scale, decimals, unit").in("id", missing)).data ?? [])
    : [];

  return {
    entity,
    sources: sources ?? [],
    figures: rows,
    previous: new Map([...rows, ...previous].map((r) => [r.id, r] as const)),
    documents: (documents.data ?? []).map((d) => ({ ...d, version: one(d.version) })),
    citations: (claims.data ?? []).map((c) => one(c.indicator)).filter((i): i is NonNullable<typeof i> => !!i),
    following: !!follow.data,
  };
}

export type EntityPage = NonNullable<Awaited<ReturnType<typeof getEntity>>>;

// ─── Document ────────────────────────────────────────────────────────────────

export async function getDocument(id: string, { figureId, version }: { figureId?: string; version?: number }) {
  const supabase = await createClient();
  const { data: document } = await supabase
    .from("documents")
    .select(
      "id, title, url, kind, language, published_at, created_at, current_version_id, watch, source:sources(id, slug, name_ar, name_en, tier, update_frequency, last_fetched_at, entity:entities(slug, name_ar, name_en))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!document) return null;

  const [versions, figures] = await Promise.all([
    supabase
      .from("document_versions")
      .select("id, version, fetched_at, fetched_via, content_hash, size_bytes, page_count, mime_type, figures_count, extraction_status, storage_path")
      .eq("document_id", id)
      .order("version", { ascending: false }),
    supabase
      .from("figures")
      .select(`${FIGURE_FIELDS}, indicator:indicators(slug, name_ar, name_en)`)
      .eq("document_id", id)
      .order("created_at", { ascending: true })
      .limit(1000),
  ]);
  const allVersions = versions.data ?? [];
  const allFigures = (figures.data ?? []).map((raw) => ({ ...(normalizeFigure(raw) as unknown as FigureRow), indicator: one(raw.indicator) }));

  const requested = figureId ? allFigures.find((f) => f.id === figureId) : undefined;
  const current =
    (version !== undefined ? allVersions.find((v) => v.version === version) : undefined) ??
    (requested ? allVersions.find((v) => v.id === requested.document_version_id) : undefined) ??
    allVersions.find((v) => v.id === document.current_version_id) ??
    allVersions[0] ??
    null;
  const versionFigures = current ? allFigures.filter((f) => f.document_version_id === current.id) : [];
  const focus = requested && requested.document_version_id === current?.id ? requested : (versionFigures[0] ?? null);

  // RLS has confirmed the viewer can see this document; only now sign the stored copy.
  let fileUrl: string | null = null;
  let downloadUrl: string | null = null;
  let excerpt: FigureExcerpt | null = null;
  if (current) {
    const admin = createAdminClient();
    const name = `${document.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "document"}.${current.storage_path.split(".").pop()}`;
    const [open, download] = await Promise.all([
      admin.storage.from("documents").createSignedUrl(current.storage_path, 60 * 30),
      admin.storage.from("documents").createSignedUrl(current.storage_path, 60 * 30, { download: name }),
    ]);
    fileUrl = open.data?.signedUrl ?? null;
    downloadUrl = download.data?.signedUrl ?? null;
  }
  if (focus) {
    const { data } = await supabase.rpc("figure_excerpt", { target_figure: focus.id });
    excerpt = (data as unknown as FigureExcerpt | null) ?? null;
  }

  return {
    document: { ...document, source: one(document.source) ? { ...one(document.source)!, entity: one(one(document.source)!.entity) } : null },
    // Storage paths stay on the server; the page gets signed URLs instead.
    versions: allVersions.map((v) => ({ ...v, storage_path: undefined })),
    current: current ? { ...current, storage_path: undefined } : null,
    figures: versionFigures,
    focus,
    excerpt,
    fileUrl,
    downloadUrl,
  };
}

export type DocumentPage = NonNullable<Awaited<ReturnType<typeof getDocument>>>;
