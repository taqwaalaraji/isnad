-- Watch, alerts, briefs, audit, usage, model settings, evaluation, Telegram, and the job queue.

-- ─── Follows and alerts ───────────────────────────────────────────────────────

create type public.follow_target as enum ('indicator', 'entity');
create type public.alert_kind as enum (
  'figure_revised',      -- an official figure used in a published/approved check was revised
  'new_release',         -- a followed source published a new document version
  'new_figure',          -- a followed indicator/entity has a new figure
  'review_requested',    -- a check was sent to you for review
  'check_ready',         -- your check finished processing
  'check_escalated'      -- a claim in a check you edit was escalated
);

create table public.follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  newsroom_id uuid not null references public.newsrooms (id) on delete cascade,
  target_type public.follow_target not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create index follows_target_idx on public.follows (target_type, target_id);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  newsroom_id uuid not null references public.newsrooms (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  kind public.alert_kind not null,
  title text not null,
  body text,
  -- Links and context: {"check_id": ..., "figure_id": ..., "previous_figure_id": ..., "indicator_id": ..., "affected_checks": [...]}
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  delivered_telegram_at timestamptz,
  delivered_email_at timestamptz,
  created_at timestamptz not null default now()
);

create index alerts_user_idx on public.alerts (user_id, created_at desc);
create index alerts_newsroom_idx on public.alerts (newsroom_id, created_at desc);

-- ─── Briefs ───────────────────────────────────────────────────────────────────

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  newsroom_id uuid not null references public.newsrooms (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  entity_id uuid not null references public.entities (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete set null,
  title text not null,
  interview_date date,
  guest_name text,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  -- {"sections": [...], "figures": [...], "generated_at": ...}
  content jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index briefs_newsroom_idx on public.briefs (newsroom_id, created_at desc);

create trigger briefs_set_updated_at
  before update on public.briefs
  for each row execute function public.set_updated_at();

-- ─── Audit and usage ──────────────────────────────────────────────────────────

create table public.activity_log (
  id bigint generated always as identity primary key,
  newsroom_id uuid references public.newsrooms (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_newsroom_idx on public.activity_log (newsroom_id, created_at desc);

create function public.log_activity(
  target_newsroom uuid, action_name text, target_kind text, target uuid, extra jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_newsroom is not null and not public.is_member(target_newsroom) and not public.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.activity_log (newsroom_id, user_id, action, target_type, target_id, details)
  values (target_newsroom, (select auth.uid()), action_name, target_kind, target, coalesce(extra, '{}'::jsonb));
end;
$$;

create table public.usage_events (
  id bigint generated always as identity primary key,
  newsroom_id uuid references public.newsrooms (id) on delete set null,
  check_id uuid references public.checks (id) on delete set null,
  task text not null,
  provider text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  audio_seconds numeric not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index usage_events_newsroom_idx on public.usage_events (newsroom_id, created_at desc);
create index usage_events_created_idx on public.usage_events (created_at desc);

-- ─── Model settings and evaluation ────────────────────────────────────────────

create table public.model_settings (
  task text primary key,
  provider text not null default 'anthropic',
  model text not null,
  effort text not null default 'medium' check (effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  description_en text,
  description_ar text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  dataset text not null default 'uae-corpus',
  settings jsonb not null default '{}'::jsonb,
  -- {"accuracy": 0.91, "by_verdict": {...}, "correct_abstention": ..., "rejected_quotes": 2, "cost_usd": ..., "seconds": ...}
  metrics jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  error text,
  started_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ─── Telegram ─────────────────────────────────────────────────────────────────

create table public.telegram_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  telegram_user_id bigint not null unique,
  telegram_username text,
  chat_id bigint not null,
  newsroom_id uuid references public.newsrooms (id) on delete set null,
  linked_at timestamptz not null default now()
);

create table public.telegram_link_tokens (
  token_hash text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ─── Job queue ────────────────────────────────────────────────────────────────
-- Claimed with FOR UPDATE SKIP LOCKED by the worker; NOTIFY wakes it immediately.

create type public.job_status as enum ('queued', 'running', 'done', 'failed', 'cancelled');

create table public.jobs (
  id bigint generated always as identity primary key,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'queued',
  priority integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  dedupe_key text,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index jobs_ready_idx on public.jobs (priority desc, id) where status = 'queued';
create unique index jobs_dedupe_idx on public.jobs (dedupe_key) where dedupe_key is not null and status in ('queued', 'running');

create function public.notify_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_notify('isnad_jobs', new.kind);
  return new;
end;
$$;

create trigger jobs_notify
  after insert on public.jobs
  for each row execute function public.notify_job();

-- Internal: enqueue a job (used by triggers and other security definer functions).
create function public.enqueue_job(job_kind text, job_payload jsonb, job_priority integer default 0, job_dedupe text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  insert into public.jobs (kind, payload, priority, dedupe_key)
  values (job_kind, job_payload, job_priority, job_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('queued', 'running') do nothing
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.enqueue_job(text, jsonb, integer, text) from public, anon, authenticated;

-- A new check starts processing right away.
create function public.enqueue_check_processing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_job('process_check', jsonb_build_object('check_id', new.id), 10, 'check:' || new.id);
  return new;
end;
$$;

create trigger checks_enqueue_processing
  after insert on public.checks
  for each row execute function public.enqueue_check_processing();
