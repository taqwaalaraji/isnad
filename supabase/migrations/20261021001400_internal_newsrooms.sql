-- Internal newsrooms (the evaluation harness's) stay out of newsroom statistics and per-check costs.
-- Platform-wide model usage (console_usage) still counts them: that spend is real.
create or replace function public.console_newsroom_stats()
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
  from public.newsrooms n
  where not n.internal;
end;
$$;

create or replace function public.console_check_costs()
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
  join public.newsrooms n on n.id = c.newsroom_id and not n.internal
  join (
    select u.check_id, sum(u.cost_usd) as cost from public.usage_events u
    where u.check_id is not null group by u.check_id
  ) per on per.check_id = c.id
  where c.created_at >= date_trunc('month', now())
  group by c.input_kind;
end;
$$;
