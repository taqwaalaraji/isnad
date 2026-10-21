-- Checks: one submission (clip, audio, document, text, link) and everything derived from it.
-- Always private to a newsroom.

create type public.check_status as enum (
  'processing', 'awaiting_review', 'in_review', 'escalated', 'approved', 'published', 'archived', 'failed'
);
create type public.check_stage as enum ('queued', 'preparing', 'transcribing', 'extracting', 'checking', 'done');
create type public.input_kind as enum ('video', 'audio', 'document', 'text', 'link');
create type public.intake_channel as enum ('web', 'telegram');
create type public.verdict as enum ('match', 'context', 'differs', 'none');
create type public.chain_status as enum ('connected', 'broken');
create type public.claim_review_state as enum ('pending', 'approved', 'edited', 'escalated');
create type public.decision_action as enum (
  'approve', 'edit', 'escalate', 'reopen', 'send_for_review', 'approve_check', 'publish', 'archive', 'recheck'
);

create table public.checks (
  id uuid primary key default gen_random_uuid(),
  newsroom_id uuid not null references public.newsrooms (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  desk_id uuid references public.desks (id) on delete set null,
  title text not null check (length(title) between 1 and 300),
  input_kind public.input_kind not null,
  channel public.intake_channel not null default 'web',
  input_text text,
  input_url text,
  storage_path text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  recorded_at date not null default current_date,
  speakers text,
  dialect text not null default 'msa' check (dialect in ('msa', 'gulf', 'egyptian', 'levantine', 'other')),
  visibility public.check_visibility not null default 'newsroom',
  status public.check_status not null default 'processing',
  stage public.check_stage not null default 'queued',
  progress jsonb not null default '{}'::jsonb,
  assigned_editor_id uuid references public.profiles (id) on delete set null,
  claim_count integer not null default 0,
  match_count integer not null default 0,
  context_count integer not null default 0,
  differs_count integer not null default 0,
  none_count integer not null default 0,
  decided_count integer not null default 0,
  registry_checked_at timestamptz,
  published_url text,
  published_at timestamptz,
  public_slug text unique,
  telegram_chat_id bigint,
  telegram_message_id bigint,
  error text,
  search_text text generated always as (public.normalize_ar(title)) stored,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (input_kind <> 'text' or input_text is not null),
  check (input_kind <> 'link' or input_url is not null),
  check (input_kind not in ('video', 'audio', 'document') or storage_path is not null or input_text is not null)
);

create index checks_newsroom_created_idx on public.checks (newsroom_id, created_at desc);
create index checks_newsroom_status_idx on public.checks (newsroom_id, status);
create index checks_editor_idx on public.checks (assigned_editor_id) where assigned_editor_id is not null;
create index checks_search_trgm_idx on public.checks using gin (search_text extensions.gin_trgm_ops);

create trigger checks_set_updated_at
  before update on public.checks
  for each row execute function public.set_updated_at();

create table public.media (
  check_id uuid primary key references public.checks (id) on delete cascade,
  has_video boolean not null default false,
  duration_ms integer,
  width integer,
  height integer,
  video_path text,
  audio_path text,
  poster_path text,
  waveform jsonb,
  created_at timestamptz not null default now()
);

-- Transcript segments for audio/video; paragraphs for documents and text.
create table public.segments (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.checks (id) on delete cascade,
  idx integer not null,
  start_ms integer,
  end_ms integer,
  speaker text,
  text text not null,
  words jsonb,
  page integer,
  low_confidence boolean not null default false,
  edited_by uuid references public.profiles (id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (check_id, idx)
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.checks (id) on delete cascade,
  idx integer not null,
  segment_id uuid references public.segments (id) on delete set null,
  -- The exact words, and where they sit in the segment text.
  span_text text not null,
  span_start integer,
  span_end integer,
  start_ms integer,
  end_ms integer,
  speaker text,
  entity_text text,
  entity_id uuid references public.entities (id) on delete set null,
  indicator_text text,
  indicator_id uuid references public.indicators (id) on delete set null,
  value numeric,
  scale text not null default 'one',
  unit text,
  value_base numeric,
  decimals smallint not null default 0,
  qualifier text not null default 'exact'
    check (qualifier in ('exact', 'about', 'more_than', 'less_than', 'at_least', 'up_to')),
  period_text text,
  period_start date,
  period_end date,
  geography text,
  breakdown text,
  claim_type text not null default 'level'
    check (claim_type in ('level', 'growth', 'share', 'rank', 'pp_change', 'ratio')),
  attribution text,
  checkable boolean not null default true,
  uncheckable_reason text,
  review_state public.claim_review_state not null default 'pending',
  created_at timestamptz not null default now(),
  unique (check_id, idx)
);

create index claims_check_idx on public.claims (check_id);
create index claims_indicator_idx on public.claims (indicator_id);

create table public.claim_results (
  claim_id uuid primary key references public.claims (id) on delete cascade,
  check_id uuid not null references public.checks (id) on delete cascade,
  verdict public.verdict not null,
  differing_fields text[] not null default '{}',
  chain_status public.chain_status not null,
  figure_id uuid references public.figures (id) on delete set null,
  document_version_id uuid references public.document_versions (id) on delete set null,
  -- {"quote": "...", "location": {...}, "highlight": "5.0", "table_context": {...}}
  evidence jsonb,
  evidence_verified boolean not null default false,
  -- {"tolerance": [...], "period_relation": "wider", "scope_relation": "same", "difference_pct": 17.0}
  comparison jsonb not null default '{}'::jsonb,
  -- {"agrees": true, "field": null, "note": "...", "confidence": "high"}
  verifier jsonb,
  needs_review boolean not null default false,
  suggested_wording text,
  searched_sources jsonb not null default '[]'::jsonb,
  chain jsonb not null default '[]'::jsonb,
  earlier_figures jsonb not null default '[]'::jsonb,
  discovered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claim_results_check_idx on public.claim_results (check_id);
create index claim_results_figure_idx on public.claim_results (figure_id);

create trigger claim_results_set_updated_at
  before update on public.claim_results
  for each row execute function public.set_updated_at();

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.checks (id) on delete cascade,
  -- Kept when a re-check replaces the claims, so the history survives.
  claim_id uuid references public.claims (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  action public.decision_action not null,
  note text,
  wording text,
  created_at timestamptz not null default now()
);

create index decisions_check_idx on public.decisions (check_id, created_at);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.checks (id) on delete cascade,
  claim_id uuid references public.claims (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index comments_check_idx on public.comments (check_id, created_at);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.checks (id) on delete cascade,
  url text not null,
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create index publications_check_idx on public.publications (check_id);

-- ─── Visibility ───────────────────────────────────────────────────────────────

create function public.can_view_check(target_check uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.checks c
    join public.memberships m
      on m.newsroom_id = c.newsroom_id
     and m.user_id = (select auth.uid())
     and m.status = 'active'
    where c.id = target_check
      and (
        c.visibility = 'newsroom'
        or c.created_by = (select auth.uid())
        or m.role in ('editor', 'admin')
        or c.assigned_editor_id = (select auth.uid())
        or (c.visibility = 'desk' and c.desk_id is not null and c.desk_id = m.desk_id)
      )
  );
$$;

create function public.can_edit_check(target_check uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.checks c
    join public.memberships m
      on m.newsroom_id = c.newsroom_id
     and m.user_id = (select auth.uid())
     and m.status = 'active'
    where c.id = target_check
      and (c.created_by = (select auth.uid()) or m.role in ('editor', 'admin'))
  );
$$;

create function public.can_decide_check(target_check uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.checks c
    join public.memberships m
      on m.newsroom_id = c.newsroom_id
     and m.user_id = (select auth.uid())
     and m.status = 'active'
    where c.id = target_check
      and m.role in ('editor', 'admin')
  );
$$;
