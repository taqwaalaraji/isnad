-- Console: the tools Isnad staff (curators and platform admins) use to run the shared registry
-- and the platform. Every function checks the caller's platform role itself; newsroom content
-- (checks, claims) is never exposed here, only counts.

-- ─── Model settings: per-task overrides ───────────────────────────────────────

alter table public.model_settings
  add column max_tokens integer check (max_tokens between 256 and 128000),
  add column enabled boolean not null default true;

-- The pipeline can't run without these tasks; optional ones (discovery, the verifier, wording
-- polish) fall back gracefully when switched off.
alter table public.model_settings
  add constraint model_settings_required_tasks_enabled
  check (enabled or task not in ('extract_claims', 'extract_figures', 'transcribe'));

-- ─── Job queue visibility for staff ───────────────────────────────────────────
-- Payloads carry ids only, never content.

create policy jobs_select_staff on public.jobs for select to authenticated using (public.is_staff());

-- ─── Small helpers ────────────────────────────────────────────────────────────

create function public.require_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

-- Does the URL's host belong to one of the domains (exactly, or as a subdomain)?
create function public.url_in_domains(target_url text, allowed text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from unnest(allowed) d,
         lateral (select lower(substring(target_url from '^[hH][tT][tT][pP][sS]?://([^/:?#]+)')) as host) h
    where h.host is not null
      and (h.host = lower(ltrim(d, '.')) or h.host like '%.' || lower(ltrim(d, '.')))
  );
$$;

-- ─── Sources and documents ────────────────────────────────────────────────────

-- Re-fetch every tracked document of a source now (the daily watch does the same on schedule).
create function public.fetch_source_now(target_source uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.sources;
  queued integer := 0;
  doc record;
begin
  perform public.require_staff();
  select * into src from public.sources where id = target_source;
  if src.id is null then
    raise exception 'source_not_found' using errcode = 'P0002';
  end if;
  if src.status <> 'active' then
    raise exception 'source_not_active' using errcode = 'P0001';
  end if;
  for doc in select id from public.documents where source_id = target_source and url is not null loop
    perform public.enqueue_job('refetch_document', jsonb_build_object('document_id', doc.id), 5, 'refetch:' || doc.id);
    queued := queued + 1;
  end loop;
  perform public.log_activity(null, 'source.fetch_now', 'source', target_source, jsonb_build_object('documents', queued));
  return queued;
end;
$$;

-- Add a document to a source: a link the worker downloads, or a file already uploaded to the
-- documents bucket under inbox/. The worker stores it as a version and extracts its figures.
create function public.add_source_document(
  target_source uuid,
  doc_title text,
  doc_url text default null,
  staging_path text default null,
  published date default null,
  doc_language text default 'ar'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.sources;
  job_id bigint;
begin
  perform public.require_staff();
  select * into src from public.sources where id = target_source;
  if src.id is null then
    raise exception 'source_not_found' using errcode = 'P0002';
  end if;
  if src.status = 'rejected' then
    raise exception 'source_not_active' using errcode = 'P0001';
  end if;
  if coalesce(btrim(doc_title), '') = '' or length(doc_title) > 500 then
    raise exception 'title_required' using errcode = '22023';
  end if;
  if (doc_url is null) = (staging_path is null) then
    raise exception 'document_input_invalid' using errcode = '22023';
  end if;
  if doc_url is not null then
    if doc_url !~* '^https?://[^\s/]+\S*$' then
      raise exception 'url_invalid' using errcode = '22023';
    end if;
    if not public.url_in_domains(doc_url, src.domains) then
      raise exception 'url_outside_source' using errcode = '22023';
    end if;
  end if;
  if staging_path is not null and (staging_path !~ '^inbox/[0-9a-f-]{36}/[^/]+$') then
    raise exception 'document_input_invalid' using errcode = '22023';
  end if;
  if doc_language not in ('ar', 'en', 'ar,en') then
    doc_language := 'ar';
  end if;

  job_id := public.enqueue_job(
    'register_document',
    jsonb_build_object(
      'source_id', src.id,
      'title', btrim(doc_title),
      'url', doc_url,
      'staging_path', staging_path,
      'published_at', published,
      'language', doc_language,
      'user_id', (select auth.uid())
    ),
    6
  );
  perform public.log_activity(
    null, 'document.added', 'source', src.id,
    jsonb_build_object('title', btrim(doc_title), 'url', doc_url, 'upload', staging_path is not null)
  );
  return job_id;
end;
$$;

create function public.retry_extraction(target_version uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  update public.document_versions
  set extraction_status = 'pending', extraction_error = null
  where id = target_version and extraction_status in ('failed', 'extracted', 'unchanged');
  if not found then
    raise exception 'version_not_retryable' using errcode = 'P0001';
  end if;
  perform public.enqueue_job('ingest_document', jsonb_build_object('version_id', target_version), 5, 'ingest:' || target_version);
end;
$$;

-- A newsroom proposed a source for the shared registry; accepting moves it there.
create function public.review_source_proposal(target_source uuid, accept boolean, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  if accept then
    update public.sources
    set status = 'active', newsroom_id = null, verified_at = current_date,
        proposal_note = coalesce(nullif(btrim(note), ''), proposal_note)
    where id = target_source and status = 'proposed';
  else
    update public.sources
    set status = 'rejected', proposal_note = coalesce(nullif(btrim(note), ''), proposal_note)
    where id = target_source and status = 'proposed';
  end if;
  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;
  perform public.log_activity(null, case when accept then 'source.accepted' else 'source.rejected' end, 'source', target_source, '{}'::jsonb);
end;
$$;

-- ─── Figure review ────────────────────────────────────────────────────────────

-- Approve pending figures; the worker then links revisions and alerts newsrooms and followers.
create function public.approve_figures(figure_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  approved uuid[];
begin
  perform public.require_staff();
  if exists (
    select 1 from public.figures
    where id = any(figure_ids) and review_status = 'pending' and indicator_id is null
  ) then
    raise exception 'indicator_required' using errcode = '22023';
  end if;

  with updated as (
    update public.figures
    set review_status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = any(figure_ids) and review_status = 'pending'
    returning id
  )
  select array_agg(id) into approved from updated;

  if approved is not null then
    perform public.enqueue_job('figures_approved', jsonb_build_object('figure_ids', to_jsonb(approved)), 5);
    perform public.log_activity(null, 'figures.approved', 'figure', approved[1], jsonb_build_object('count', cardinality(approved)));
  end if;
  return coalesce(cardinality(approved), 0);
end;
$$;

create function public.reject_figures(figure_ids uuid[], note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rejected integer;
begin
  perform public.require_staff();
  update public.figures
  set review_status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now(),
      review_note = coalesce(nullif(btrim(note), ''), review_note)
  where id = any(figure_ids) and review_status = 'pending';
  get diagnostics rejected = row_count;
  if rejected > 0 then
    perform public.log_activity(null, 'figures.rejected', 'figure', figure_ids[1], jsonb_build_object('count', rejected));
  end if;
  return rejected;
end;
$$;

-- Correct a pending figure's fields. The value in base units follows the value and scale; a changed
-- value is no longer covered by the verbatim check, so the reviewer sees it as unverified.
create function public.update_figure(
  target_figure uuid,
  new_indicator uuid,
  new_entity uuid,
  new_value numeric,
  new_scale text,
  new_decimals smallint,
  new_unit text,
  new_period_start date,
  new_period_end date,
  new_period_label text,
  new_geography text,
  new_breakdown text,
  new_measure text,
  new_status public.figure_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fig public.figures;
  multiplier numeric;
begin
  perform public.require_staff();
  select * into fig from public.figures where id = target_figure for update;
  if fig.id is null then
    raise exception 'figure_not_found' using errcode = 'P0002';
  end if;
  if fig.review_status <> 'pending' then
    raise exception 'figure_not_pending' using errcode = 'P0001';
  end if;
  if new_period_end < new_period_start then
    raise exception 'period_invalid' using errcode = '22023';
  end if;
  if coalesce(btrim(new_geography), '') = '' or coalesce(btrim(new_period_label), '') = '' then
    raise exception 'fields_required' using errcode = '22023';
  end if;
  multiplier := case new_scale
    when 'thousand' then 1e3 when 'million' then 1e6 when 'billion' then 1e9 when 'trillion' then 1e12 else 1
  end;

  update public.figures
  set indicator_id = new_indicator,
      entity_id = new_entity,
      value = new_value,
      scale = new_scale,
      decimals = new_decimals,
      value_base = case when new_unit = '%' then new_value else new_value * multiplier end,
      unit = coalesce(new_unit, ''),
      period_start = new_period_start,
      period_end = new_period_end,
      period_label = btrim(new_period_label),
      geography = btrim(new_geography),
      breakdown = nullif(btrim(new_breakdown), ''),
      measure = new_measure,
      status = new_status,
      quote_verified = fig.quote_verified and new_value = fig.value and new_scale = fig.scale
  where id = target_figure;
end;
$$;

-- Give pending figures an indicator (e.g. after creating one a reviewer or the extractor proposed).
create function public.assign_indicator(figure_ids uuid[], target_indicator uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned integer;
begin
  perform public.require_staff();
  if not exists (select 1 from public.indicators where id = target_indicator) then
    raise exception 'indicator_not_found' using errcode = 'P0002';
  end if;
  update public.figures
  set indicator_id = target_indicator, review_note = null
  where id = any(figure_ids) and review_status = 'pending';
  get diagnostics assigned = row_count;
  return assigned;
end;
$$;

-- Drop the "proposed indicator" note from figures without creating one (they stay in review).
create function public.dismiss_indicator_proposal(figure_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  dismissed integer;
begin
  perform public.require_staff();
  update public.figures
  set review_note = null
  where id = any(figure_ids) and review_status = 'pending' and review_note like 'proposed indicator:%';
  get diagnostics dismissed = row_count;
  return dismissed;
end;
$$;

-- ─── Jobs ─────────────────────────────────────────────────────────────────────

create function public.retry_job(target_job bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.jobs;
begin
  perform public.require_staff();
  select * into job from public.jobs where id = target_job for update;
  if job.id is null or job.status not in ('failed', 'cancelled') then
    raise exception 'job_not_retryable' using errcode = 'P0001';
  end if;
  if job.dedupe_key is not null and exists (
    select 1 from public.jobs
    where dedupe_key = job.dedupe_key and status in ('queued', 'running') and id <> job.id
  ) then
    raise exception 'job_duplicate' using errcode = 'P0001';
  end if;
  update public.jobs
  set status = 'queued', attempts = 0, run_after = now(), last_error = null,
      locked_at = null, locked_by = null, started_at = null, finished_at = null
  where id = target_job;
  perform pg_notify('isnad_jobs', job.kind);
end;
$$;

create function public.cancel_job(target_job bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  update public.jobs set status = 'cancelled', finished_at = now()
  where id = target_job and status = 'queued';
  if not found then
    raise exception 'job_not_cancellable' using errcode = 'P0001';
  end if;
end;
$$;

-- ─── Aggregates for the console (counts and costs only) ───────────────────────

create function public.console_newsroom_stats()
returns table (
  newsroom_id uuid,
  members integer,
  checks_this_month integer,
  media_minutes_this_month numeric,
  cost_this_month numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select
    n.id,
    (select count(*)::integer from public.memberships m where m.newsroom_id = n.id and m.status = 'active'),
    (select count(*)::integer from public.checks c
      where c.newsroom_id = n.id and c.created_at >= date_trunc('month', now())),
    (select coalesce(round(sum(md.duration_ms) / 60000.0, 1), 0) from public.media md
      join public.checks c on c.id = md.check_id
      where c.newsroom_id = n.id and c.created_at >= date_trunc('month', now())),
    (select coalesce(sum(u.cost_usd), 0) from public.usage_events u
      where u.newsroom_id = n.id and u.created_at >= date_trunc('month', now()))
  from public.newsrooms n;
end;
$$;

-- Model usage per day and task over the last `days` days.
create function public.console_usage(days integer default 30)
returns table (day date, task text, events integer, cost numeric, input_tokens bigint, output_tokens bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select (u.created_at at time zone 'Asia/Dubai')::date, u.task, count(*)::integer, sum(u.cost_usd),
         sum(u.input_tokens)::bigint, sum(u.output_tokens)::bigint
  from public.usage_events u
  where u.created_at >= now() - make_interval(days => greatest(1, least(days, 365)))
  group by 1, 2
  order by 1 desc, 2;
end;
$$;

-- Average model cost of a finished check this month, by input kind.
create function public.console_check_costs()
returns table (input_kind public.input_kind, checks integer, avg_cost numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select c.input_kind, count(*)::integer, round(avg(per.cost), 4)
  from public.checks c
  join (
    select u.check_id, sum(u.cost_usd) as cost from public.usage_events u
    where u.check_id is not null group by u.check_id
  ) per on per.check_id = c.id
  where c.created_at >= date_trunc('month', now())
  group by c.input_kind;
end;
$$;

create function public.console_job_stats()
returns table (kind text, status public.job_status, jobs integer, oldest timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  return query
  select j.kind, j.status, count(*)::integer, min(j.created_at)
  from public.jobs j
  where j.status in ('queued', 'running') or j.created_at >= now() - interval '7 days'
  group by 1, 2
  order by 1, 2;
end;
$$;

revoke execute on function public.require_staff() from public, anon;
revoke execute on function public.fetch_source_now(uuid) from public, anon;
revoke execute on function public.add_source_document(uuid, text, text, text, date, text) from public, anon;
revoke execute on function public.retry_extraction(uuid) from public, anon;
revoke execute on function public.review_source_proposal(uuid, boolean, text) from public, anon;
revoke execute on function public.approve_figures(uuid[]) from public, anon;
revoke execute on function public.reject_figures(uuid[], text) from public, anon;
revoke execute on function public.update_figure(uuid, uuid, uuid, numeric, text, smallint, text, date, date, text, text, text, text, public.figure_status) from public, anon;
revoke execute on function public.assign_indicator(uuid[], uuid) from public, anon;
revoke execute on function public.dismiss_indicator_proposal(uuid[]) from public, anon;
revoke execute on function public.retry_job(bigint) from public, anon;
revoke execute on function public.cancel_job(bigint) from public, anon;
revoke execute on function public.console_newsroom_stats() from public, anon;
revoke execute on function public.console_usage(integer) from public, anon;
revoke execute on function public.console_check_costs() from public, anon;
revoke execute on function public.console_job_stats() from public, anon;

-- Staff see open invitations (who was invited, not the token) when looking after newsrooms.
create policy invitations_select_staff on public.invitations for select to authenticated using (public.is_staff());
