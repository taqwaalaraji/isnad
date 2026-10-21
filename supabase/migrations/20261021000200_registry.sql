-- The Isnad Registry: what official sources said, when, and where.
-- Rows with newsroom_id = null are the shared registry curated by Isnad;
-- rows with a newsroom_id are that newsroom's private sources.

create type public.entity_kind as enum (
  'statistics_office', 'ministry', 'authority', 'central_bank', 'government_department',
  'news_agency', 'media_office', 'open_data_portal', 'exchange', 'international_org', 'other'
);
create type public.entity_level as enum ('federal', 'emirate', 'international', 'other');
create type public.source_status as enum ('active', 'paused', 'proposed', 'rejected');
create type public.source_health as enum ('healthy', 'warning', 'failing', 'unknown');
create type public.document_kind as enum ('pdf', 'xlsx', 'csv', 'html', 'docx', 'text');
create type public.fetch_origin as enum ('upload', 'schedule', 'discovery', 'seed');
create type public.extraction_status as enum ('pending', 'extracting', 'extracted', 'failed', 'unchanged');
create type public.unit_kind as enum ('count', 'currency', 'percent', 'ratio', 'index', 'rate', 'duration', 'area', 'volume', 'weight', 'energy', 'other');
create type public.figure_status as enum ('preliminary', 'final', 'revised');
create type public.review_status as enum ('pending', 'approved', 'rejected');

-- ─── Catalog ──────────────────────────────────────────────────────────────────

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ar text not null,
  name_en text not null,
  icon text not null default 'chart',
  sort_order integer not null default 0
);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ar text not null,
  name_en text not null,
  short_name_ar text,
  short_name_en text,
  kind public.entity_kind not null default 'other',
  level public.entity_level not null default 'federal',
  emirate text,
  website text,
  description_ar text,
  description_en text,
  aliases text[] not null default '{}',
  search_text text generated always as (
    public.normalize_ar(
      name_ar || ' ' || name_en || ' ' || coalesce(short_name_ar, '') || ' ' ||
      coalesce(short_name_en, '') || ' ' || public.join_text(aliases)
    )
  ) stored,
  created_at timestamptz not null default now()
);

create index entities_search_trgm_idx on public.entities using gin (search_text extensions.gin_trgm_ops);

create table public.indicators (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  topic_id uuid references public.topics (id) on delete set null,
  name_ar text not null,
  name_en text not null,
  aliases text[] not null default '{}',
  definition_ar text,
  definition_en text,
  unit_kind public.unit_kind not null default 'count',
  unit text not null default '',
  frequency text,
  default_geography text not null default 'UAE',
  search_text text generated always as (
    public.normalize_ar(name_ar || ' ' || name_en || ' ' || public.join_text(aliases))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index indicators_topic_idx on public.indicators (topic_id);
create index indicators_search_trgm_idx on public.indicators using gin (search_text extensions.gin_trgm_ops);

create trigger indicators_set_updated_at
  before update on public.indicators
  for each row execute function public.set_updated_at();

-- ─── Sources ──────────────────────────────────────────────────────────────────

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  newsroom_id uuid references public.newsrooms (id) on delete cascade,
  entity_id uuid references public.entities (id) on delete set null,
  slug text not null unique,
  name_ar text not null,
  name_en text not null,
  tier smallint not null check (tier between 1 and 3),
  type text not null default 'publications',
  homepage_url text,
  data_url text,
  domains text[] not null default '{}',
  access_methods text[] not null default '{}',
  update_frequency text,
  languages text[] not null default '{ar}',
  description_ar text,
  description_en text,
  terms_url text,
  status public.source_status not null default 'active',
  health public.source_health not null default 'unknown',
  health_note text,
  last_fetched_at timestamptz,
  verified_at date,
  proposed_by uuid references public.profiles (id) on delete set null,
  proposal_note text,
  search_text text generated always as (
    public.normalize_ar(name_ar || ' ' || name_en || ' ' || public.join_text(domains))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sources_newsroom_idx on public.sources (newsroom_id);
create index sources_entity_idx on public.sources (entity_id);
create index sources_search_trgm_idx on public.sources using gin (search_text extensions.gin_trgm_ops);

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

create table public.source_topics (
  source_id uuid not null references public.sources (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  primary key (source_id, topic_id)
);

-- ─── Documents and their versions ─────────────────────────────────────────────

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  newsroom_id uuid references public.newsrooms (id) on delete cascade,
  title text not null,
  url text,
  kind public.document_kind not null,
  language text not null default 'ar',
  published_at date,
  watch boolean not null default true,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index documents_source_url_idx on public.documents (source_id, url) where url is not null;
create index documents_newsroom_idx on public.documents (newsroom_id);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version integer not null,
  storage_path text not null,
  content_hash text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  page_count integer,
  fetched_at timestamptz not null default now(),
  fetched_via public.fetch_origin not null,
  fetched_by uuid references public.profiles (id) on delete set null,
  text_content text,
  text_normalized text,
  tables jsonb not null default '[]'::jsonb,
  extraction_status public.extraction_status not null default 'pending',
  extraction_error text,
  figures_count integer not null default 0,
  previous_version_id uuid references public.document_versions (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version),
  unique (document_id, content_hash)
);

create index document_versions_document_idx on public.document_versions (document_id);
create index document_versions_status_idx on public.document_versions (extraction_status);

alter table public.documents
  add constraint documents_current_version_fk
  foreign key (current_version_id) references public.document_versions (id) on delete set null;

-- ─── Figures ──────────────────────────────────────────────────────────────────

create table public.figures (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  newsroom_id uuid references public.newsrooms (id) on delete cascade,
  indicator_id uuid references public.indicators (id) on delete set null,
  entity_id uuid references public.entities (id) on delete set null,
  -- The value exactly as published, and normalized to base units (scale applied).
  value numeric not null,
  scale text not null default 'one' check (scale in ('one', 'thousand', 'million', 'billion', 'trillion')),
  decimals smallint not null default 0,
  value_base numeric not null,
  unit text not null default '',
  period_start date not null,
  period_end date not null,
  period_label text not null,
  geography text not null default 'UAE',
  breakdown text,
  -- What the number measures for its indicator: the level itself, or a change or share of it.
  measure text not null default 'level'
    check (measure in ('level', 'growth_yoy', 'growth_qoq', 'growth', 'share', 'rank', 'change')),
  status public.figure_status not null default 'final',
  -- Where it is in the document: {"page": 4, "table": "3", "row": "...", "column": "...", "sheet": "...", "cell": "C12"}
  location jsonb not null default '{}'::jsonb,
  -- Verbatim text (sentence or table row) the figure was read from.
  quote text not null,
  quote_verified boolean not null default false,
  review_status public.review_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  supersedes_id uuid references public.figures (id) on delete set null,
  is_current boolean not null default true,
  published_at date,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index figures_lookup_idx on public.figures (indicator_id, measure, geography, period_start, period_end)
  where review_status = 'approved';
create index figures_version_idx on public.figures (document_version_id);
create index figures_review_idx on public.figures (review_status, created_at);
create index figures_entity_idx on public.figures (entity_id);
