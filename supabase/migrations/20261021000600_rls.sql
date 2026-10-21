-- Row-level security. The browser and server components act as the signed-in user;
-- the worker and privileged server code use the secret key and bypass these policies.

-- Enable RLS everywhere (no policy = no access).
alter table public.profiles enable row level security;
alter table public.newsrooms enable row level security;
alter table public.desks enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.topics enable row level security;
alter table public.entities enable row level security;
alter table public.indicators enable row level security;
alter table public.sources enable row level security;
alter table public.source_topics enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.figures enable row level security;
alter table public.checks enable row level security;
alter table public.media enable row level security;
alter table public.segments enable row level security;
alter table public.claims enable row level security;
alter table public.claim_results enable row level security;
alter table public.decisions enable row level security;
alter table public.comments enable row level security;
alter table public.publications enable row level security;
alter table public.follows enable row level security;
alter table public.alerts enable row level security;
alter table public.briefs enable row level security;
alter table public.activity_log enable row level security;
alter table public.usage_events enable row level security;
alter table public.model_settings enable row level security;
alter table public.eval_runs enable row level security;
alter table public.telegram_links enable row level security;
alter table public.telegram_link_tokens enable row level security;
alter table public.jobs enable row level security;

-- Nothing is readable without signing in (except get_public_note).
revoke all on all tables in schema public from anon;

-- ─── People and newsrooms ─────────────────────────────────────────────────────

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_newsroom(id) or public.is_staff());

-- Users edit their own name and preferences; role columns are protected by the trigger below.
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.platform_role := old.platform_role;
    new.email := old.email;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

create policy newsrooms_select on public.newsrooms for select to authenticated
  using (public.is_member(id) or public.is_staff());

create policy newsrooms_update_admin on public.newsrooms for update to authenticated
  using (public.has_role(id, '{admin}') or public.is_platform_admin())
  with check (public.has_role(id, '{admin}') or public.is_platform_admin());

create policy newsrooms_insert_platform on public.newsrooms for insert to authenticated
  with check (public.is_platform_admin());

create policy desks_select on public.desks for select to authenticated
  using (public.is_member(newsroom_id) or public.is_staff());

create policy desks_write_admin on public.desks for all to authenticated
  using (public.has_role(newsroom_id, '{admin}'))
  with check (public.has_role(newsroom_id, '{admin}'));

create policy memberships_select on public.memberships for select to authenticated
  using (public.is_member(newsroom_id) or public.is_staff());

create policy memberships_write_admin on public.memberships for update to authenticated
  using (public.has_role(newsroom_id, '{admin}') or public.is_platform_admin())
  with check (public.has_role(newsroom_id, '{admin}') or public.is_platform_admin());

create policy memberships_delete_admin on public.memberships for delete to authenticated
  using (public.has_role(newsroom_id, '{admin}') or public.is_platform_admin());

create policy invitations_admin on public.invitations for select to authenticated
  using (public.has_role(newsroom_id, '{admin}') or public.is_platform_admin());

create policy invitations_revoke_admin on public.invitations for update to authenticated
  using (public.has_role(newsroom_id, '{admin}') or public.is_platform_admin())
  with check (public.has_role(newsroom_id, '{admin}') or public.is_platform_admin());

-- ─── Registry ─────────────────────────────────────────────────────────────────

create policy topics_select on public.topics for select to authenticated using (true);
create policy topics_write_staff on public.topics for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy entities_select on public.entities for select to authenticated using (true);
create policy entities_write_staff on public.entities for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy indicators_select on public.indicators for select to authenticated using (true);
create policy indicators_write_staff on public.indicators for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy sources_select on public.sources for select to authenticated
  using (
    (newsroom_id is null and status in ('active', 'paused'))
    or (newsroom_id is not null and public.is_member(newsroom_id))
    or public.is_staff()
  );

create policy sources_write_staff on public.sources for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Newsroom admins manage their private sources and can propose shared ones.
create policy sources_insert_newsroom on public.sources for insert to authenticated
  with check (newsroom_id is not null and public.has_role(newsroom_id, '{admin}'));

create policy sources_update_newsroom on public.sources for update to authenticated
  using (newsroom_id is not null and public.has_role(newsroom_id, '{admin}'))
  with check (newsroom_id is not null and public.has_role(newsroom_id, '{admin}'));

create policy sources_delete_newsroom on public.sources for delete to authenticated
  using (newsroom_id is not null and public.has_role(newsroom_id, '{admin}'));

create policy source_topics_select on public.source_topics for select to authenticated using (true);
create policy source_topics_write_staff on public.source_topics for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy documents_select on public.documents for select to authenticated
  using ((newsroom_id is null) or public.is_member(newsroom_id) or public.is_staff());

create policy document_versions_select on public.document_versions for select to authenticated
  using (exists (
    select 1 from public.documents d
    where d.id = document_id
      and (d.newsroom_id is null or public.is_member(d.newsroom_id) or public.is_staff())
  ));

-- Pending and rejected figures are only for curators.
create policy figures_select on public.figures for select to authenticated
  using (
    public.is_staff()
    or (review_status = 'approved' and (newsroom_id is null or public.is_member(newsroom_id)))
  );

create policy figures_review_staff on public.figures for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ─── Checks ───────────────────────────────────────────────────────────────────

create policy checks_select on public.checks for select to authenticated
  using (public.can_view_check(id));

create policy checks_insert on public.checks for insert to authenticated
  with check (
    public.is_member(newsroom_id)
    and created_by = (select auth.uid())
    and status = 'processing'
    and stage = 'queued'
  );

-- Owners and editors can rename, change visibility, or move a check to a desk.
create policy checks_update on public.checks for update to authenticated
  using (public.can_edit_check(id))
  with check (public.can_edit_check(id));

create function public.protect_check_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Status and results change only through the workflow functions and the worker.
  if current_user = 'authenticated' then
    new.status := old.status;
    new.stage := old.stage;
    new.progress := old.progress;
    new.newsroom_id := old.newsroom_id;
    new.created_by := old.created_by;
    new.claim_count := old.claim_count;
    new.match_count := old.match_count;
    new.context_count := old.context_count;
    new.differs_count := old.differs_count;
    new.none_count := old.none_count;
    new.decided_count := old.decided_count;
    new.published_url := old.published_url;
    new.published_at := old.published_at;
    new.public_slug := old.public_slug;
    new.storage_path := old.storage_path;
    new.input_kind := old.input_kind;
  end if;
  return new;
end;
$$;

create trigger checks_protect_columns
  before update on public.checks
  for each row execute function public.protect_check_columns();

create policy media_select on public.media for select to authenticated using (public.can_view_check(check_id));
create policy segments_select on public.segments for select to authenticated using (public.can_view_check(check_id));
create policy claims_select on public.claims for select to authenticated using (public.can_view_check(check_id));
create policy claim_results_select on public.claim_results for select to authenticated using (public.can_view_check(check_id));
create policy decisions_select on public.decisions for select to authenticated using (public.can_view_check(check_id));
create policy publications_select on public.publications for select to authenticated using (public.can_view_check(check_id));

create policy comments_select on public.comments for select to authenticated using (public.can_view_check(check_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.can_view_check(check_id) and user_id = (select auth.uid()));
create policy comments_delete_own on public.comments for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─── Watch, alerts, briefs ────────────────────────────────────────────────────

create policy follows_own on public.follows for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_member(newsroom_id));

create policy alerts_select on public.alerts for select to authenticated
  using (user_id = (select auth.uid()) or (user_id is null and public.is_member(newsroom_id)));

create policy alerts_update_own on public.alerts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy briefs_select on public.briefs for select to authenticated using (public.is_member(newsroom_id));
create policy briefs_insert on public.briefs for insert to authenticated
  with check (public.is_member(newsroom_id) and created_by = (select auth.uid()));
create policy briefs_delete on public.briefs for delete to authenticated
  using (created_by = (select auth.uid()) or public.has_role(newsroom_id, '{admin}'));

-- ─── Audit, usage, models ─────────────────────────────────────────────────────

create policy activity_log_select on public.activity_log for select to authenticated
  using ((newsroom_id is not null and public.has_role(newsroom_id, '{admin}')) or public.is_staff());

create policy usage_events_select on public.usage_events for select to authenticated
  using ((newsroom_id is not null and public.has_role(newsroom_id, '{admin}')) or public.is_staff());

create policy model_settings_select on public.model_settings for select to authenticated using (public.is_staff());
create policy model_settings_update on public.model_settings for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy eval_runs_select on public.eval_runs for select to authenticated using (public.is_staff());
create policy eval_runs_insert on public.eval_runs for insert to authenticated
  with check (public.is_staff() and started_by = (select auth.uid()) and status = 'queued');

-- ─── Telegram ─────────────────────────────────────────────────────────────────

create policy telegram_links_own on public.telegram_links for select to authenticated
  using (user_id = (select auth.uid()));
create policy telegram_links_unlink on public.telegram_links for delete to authenticated
  using (user_id = (select auth.uid()));

-- telegram_link_tokens and jobs: no client access at all.
