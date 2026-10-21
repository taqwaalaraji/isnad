-- Newsroom administration: invitations, members, policies, activity and usage; alerts and briefs helpers.
-- Every change an admin makes goes through these functions (or RLS plus the guards below), so the
-- rules — admins only, a newsroom always keeps an active admin, Isnad-set limits stay Isnad's — hold
-- whichever way a request arrives.

-- ─── Guards ───────────────────────────────────────────────────────────────────

-- Newsroom admins may edit policies, but not what Isnad sets (limits, status, identity).
create or replace function public.protect_newsroom_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not public.is_platform_admin() then
    new.slug := old.slug;
    new.kind := old.kind;
    new.status := old.status;
    new.monthly_check_limit := old.monthly_check_limit;
  end if;
  return new;
end;
$$;

drop trigger if exists newsrooms_protect_columns on public.newsrooms;
create trigger newsrooms_protect_columns
  before update on public.newsrooms
  for each row execute function public.protect_newsroom_columns();

-- A membership can't move to another newsroom or person.
create or replace function public.protect_membership_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.newsroom_id := old.newsroom_id;
  new.user_id := old.user_id;
  return new;
end;
$$;

drop trigger if exists memberships_protect_columns on public.memberships;
create trigger memberships_protect_columns
  before update on public.memberships
  for each row execute function public.protect_membership_columns();

-- A newsroom always keeps at least one active admin (unless the newsroom itself is being deleted).
create or replace function public.ensure_newsroom_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'admin' or old.status <> 'active' then
    return null;
  end if;
  if not exists (select 1 from public.newsrooms where id = old.newsroom_id) then
    return null;
  end if;
  if not exists (
    select 1 from public.memberships
    where newsroom_id = old.newsroom_id and role = 'admin' and status = 'active'
  ) then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists memberships_keep_admin on public.memberships;
create trigger memberships_keep_admin
  after update or delete on public.memberships
  for each row execute function public.ensure_newsroom_admin();

create or replace function public.require_newsroom_admin(target_newsroom uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_role(target_newsroom, '{admin}') or public.is_platform_admin()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.require_newsroom_admin(uuid) from public, anon;

-- ─── Invitations ──────────────────────────────────────────────────────────────

-- Creates (or renews) an open invitation and returns its raw token; only the hash is stored.
create or replace function public.create_invitation(
  target_newsroom uuid,
  invite_email text,
  invite_name text default '',
  invite_role public.member_role default 'journalist',
  invite_desk uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(btrim(coalesce(invite_email, '')));
  raw text;
begin
  perform public.require_newsroom_admin(target_newsroom);
  if normalized !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.memberships m join public.profiles p on p.id = m.user_id
    where m.newsroom_id = target_newsroom and lower(p.email) = normalized and m.status = 'active'
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  if invite_desk is not null and not exists (
    select 1 from public.desks where id = invite_desk and newsroom_id = target_newsroom
  ) then
    raise exception 'desk_invalid' using errcode = '22023';
  end if;

  raw := encode(extensions.gen_random_bytes(24), 'hex');

  -- One open invitation per address: renewing replaces the token and the details.
  update public.invitations
  set token_hash = encode(extensions.digest(raw, 'sha256'), 'hex'),
      full_name = coalesce(nullif(btrim(invite_name), ''), full_name),
      role = invite_role,
      desk_id = invite_desk,
      invited_by = (select auth.uid()),
      expires_at = now() + interval '14 days',
      created_at = now()
  where newsroom_id = target_newsroom and email = normalized and accepted_at is null and revoked_at is null;

  if not found then
    insert into public.invitations (newsroom_id, email, full_name, role, desk_id, invited_by, token_hash)
    values (
      target_newsroom, normalized, coalesce(btrim(invite_name), ''), invite_role, invite_desk,
      (select auth.uid()), encode(extensions.digest(raw, 'sha256'), 'hex')
    );
  end if;

  perform public.log_activity(
    target_newsroom, 'member.invited', 'invitation', null,
    jsonb_build_object('email', normalized, 'role', invite_role)
  );
  return raw;
end;
$$;

-- A fresh token and expiry for an open invitation (the old link stops working).
create or replace function public.renew_invitation(target_invitation uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
  raw text;
begin
  select * into inv from public.invitations where id = target_invitation;
  if inv.id is null then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  perform public.require_newsroom_admin(inv.newsroom_id);
  if inv.accepted_at is not null or inv.revoked_at is not null then
    raise exception 'invitation_used' using errcode = 'P0001';
  end if;
  raw := encode(extensions.gen_random_bytes(24), 'hex');
  update public.invitations
  set token_hash = encode(extensions.digest(raw, 'sha256'), 'hex'),
      expires_at = now() + interval '14 days',
      invited_by = (select auth.uid())
  where id = inv.id;
  return raw;
end;
$$;

create or replace function public.revoke_invitation(target_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations where id = target_invitation;
  if inv.id is null then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  perform public.require_newsroom_admin(inv.newsroom_id);
  update public.invitations set revoked_at = now()
  where id = inv.id and accepted_at is null and revoked_at is null;
  perform public.log_activity(
    inv.newsroom_id, 'member.invitation_revoked', 'invitation', inv.id, jsonb_build_object('email', inv.email)
  );
end;
$$;

-- What the invite page shows before accepting. Anyone holding the token may see the newsroom's name;
-- the address is only shown in full to its owner.
create or replace function public.invitation_preview(raw_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
  me_email text;
  state text;
begin
  select * into inv from public.invitations
  where token_hash = encode(extensions.digest(coalesce(raw_token, ''), 'sha256'), 'hex');
  if inv.id is null then
    return jsonb_build_object('state', 'invalid');
  end if;

  select lower(p.email) into me_email from public.profiles p where p.id = (select auth.uid());

  state := case
    when inv.revoked_at is not null then 'invalid'
    when inv.accepted_at is not null then 'used'
    when inv.expires_at < now() then 'expired'
    when me_email is null then 'signed_out'
    when me_email <> inv.email then 'wrong_account'
    else 'open'
  end;

  return jsonb_build_object(
    'state', state,
    'newsroom_id', inv.newsroom_id,
    'newsroom_name', (select n.name from public.newsrooms n where n.id = inv.newsroom_id),
    'role', inv.role,
    'desk_name', (select d.name from public.desks d where d.id = inv.desk_id),
    'invited_by', (select p.full_name from public.profiles p where p.id = inv.invited_by),
    'full_name', inv.full_name,
    'email', case
      when me_email = inv.email then inv.email
      else regexp_replace(inv.email, '^(.).*(@.*)$', '\1•••\2')
    end,
    'created_at', inv.created_at,
    'expires_at', inv.expires_at
  );
end;
$$;

grant execute on function public.invitation_preview(text) to anon, authenticated;

-- The invited address for a token, so the invite page can send a sign-in link without revealing it.
create or replace function public.invitation_email(raw_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select inv.email from public.invitations inv
  where inv.token_hash = encode(extensions.digest(coalesce(raw_token, ''), 'sha256'), 'hex')
    and inv.accepted_at is null and inv.revoked_at is null and inv.expires_at > now();
$$;

revoke execute on function public.invitation_email(text) from public, anon, authenticated;

-- ─── Members ──────────────────────────────────────────────────────────────────

-- Members with what only admins should see together: last sign-in and Telegram link state.
create or replace function public.newsroom_members(target_newsroom uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.member_role,
  desk_id uuid,
  desk_name text,
  status public.member_status,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  telegram_username text,
  telegram_linked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_newsroom_admin(target_newsroom);
  return query
  select m.user_id, p.full_name, p.email, m.role, m.desk_id, d.name, m.status, m.created_at,
         u.last_sign_in_at, l.telegram_username, l.user_id is not null
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  left join public.desks d on d.id = m.desk_id
  left join public.telegram_links l on l.user_id = m.user_id
  where m.newsroom_id = target_newsroom
  order by m.status, p.full_name;
end;
$$;

create or replace function public.update_member(
  target_newsroom uuid,
  target_user uuid,
  new_role public.member_role,
  new_desk uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.memberships;
begin
  perform public.require_newsroom_admin(target_newsroom);
  select * into current from public.memberships where newsroom_id = target_newsroom and user_id = target_user;
  if current.user_id is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if new_desk is not null and not exists (
    select 1 from public.desks where id = new_desk and newsroom_id = target_newsroom
  ) then
    raise exception 'desk_invalid' using errcode = '22023';
  end if;

  update public.memberships set role = new_role, desk_id = new_desk
  where newsroom_id = target_newsroom and user_id = target_user;

  if current.role <> new_role or current.desk_id is distinct from new_desk then
    perform public.log_activity(
      target_newsroom, 'member.updated', 'user', target_user,
      jsonb_build_object('role', new_role, 'previous_role', current.role, 'desk_id', new_desk)
    );
  end if;
end;
$$;

create or replace function public.set_member_status(
  target_newsroom uuid,
  target_user uuid,
  new_status public.member_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_newsroom_admin(target_newsroom);
  update public.memberships set status = new_status
  where newsroom_id = target_newsroom and user_id = target_user and status <> new_status;
  if found then
    perform public.log_activity(
      target_newsroom,
      case when new_status = 'active' then 'member.reactivated' else 'member.deactivated' end,
      'user', target_user, '{}'::jsonb
    );
  end if;
end;
$$;

-- ─── Activity and usage ───────────────────────────────────────────────────────

-- One feed: audit entries and review decisions, newest first, with names and check titles.
create or replace function public.newsroom_activity(
  target_newsroom uuid,
  before_at timestamptz default null,
  page_size integer default 50,
  only_user uuid default null
)
returns table (
  at timestamptz,
  user_id uuid,
  user_name text,
  action text,
  target_type text,
  target_id uuid,
  target_title text,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_newsroom_admin(target_newsroom);
  return query
  select * from (
    select a.created_at, a.user_id, p.full_name, a.action, a.target_type, a.target_id,
           coalesce(c.title, a.details ->> 'title'), a.details
    from public.activity_log a
    left join public.profiles p on p.id = a.user_id
    left join public.checks c on a.target_type = 'check' and c.id = a.target_id
    where a.newsroom_id = target_newsroom
    union all
    select d.created_at, d.user_id, p.full_name, 'decision.' || d.action::text, 'check', d.check_id, c.title,
           jsonb_strip_nulls(jsonb_build_object('note', d.note, 'claim_id', d.claim_id))
    from public.decisions d
    join public.checks c on c.id = d.check_id
    left join public.profiles p on p.id = d.user_id
    where c.newsroom_id = target_newsroom
  ) feed (at, user_id, user_name, action, target_type, target_id, target_title, details)
  where (before_at is null or feed.at < before_at)
    and (only_user is null or feed.user_id = only_user)
  order by feed.at desc
  limit least(greatest(page_size, 1), 500);
end;
$$;

-- Month-to-date numbers for the activity page, in Dubai time.
create or replace function public.newsroom_stats(target_newsroom uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai';
  last_month_start timestamptz := (date_trunc('month', now() at time zone 'Asia/Dubai') - interval '1 month') at time zone 'Asia/Dubai';
  result jsonb;
begin
  perform public.require_newsroom_admin(target_newsroom);

  with month_checks as (
    select c.* from public.checks c
    where c.newsroom_id = target_newsroom and c.created_at >= month_start
  ),
  month_claims as (
    select cl.id, r.chain_status, r.verdict
    from public.claims cl
    join month_checks c on c.id = cl.check_id
    left join public.claim_results r on r.claim_id = cl.id
    where cl.checkable
  ),
  reviews as (
    select extract(epoch from (d.created_at - c.created_at)) / 3600.0 as hours
    from public.decisions d
    join public.checks c on c.id = d.check_id
    where c.newsroom_id = target_newsroom and d.action = 'approve_check'
      and d.created_at >= now() - interval '90 days'
  ),
  days as (
    select generate_series(
      (date_trunc('day', now() at time zone 'Asia/Dubai') - interval '13 days')::date,
      (now() at time zone 'Asia/Dubai')::date,
      interval '1 day'
    )::date as day
  )
  select jsonb_build_object(
    'month_start', month_start,
    'checks_this_month', (select count(*) from month_checks),
    'checks_last_month', (
      select count(*) from public.checks
      where newsroom_id = target_newsroom and created_at >= last_month_start and created_at < month_start
    ),
    'media_minutes', (
      select coalesce(round(sum(m.duration_ms) / 60000.0), 0)
      from public.media m join month_checks c on c.id = m.check_id
    ),
    'by_kind', (
      select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
      from (select input_kind::text as kind, count(*) as n from month_checks group by input_kind) k
    ),
    'claims_this_month', (select count(*) from month_claims),
    'claims_connected', (select count(*) from month_claims where chain_status = 'connected'),
    'awaiting_review', (
      select count(*) from public.checks
      where newsroom_id = target_newsroom and status in ('awaiting_review', 'in_review', 'escalated')
    ),
    'avg_review_hours', (select round(avg(hours)::numeric, 1) from reviews),
    'daily', (
      select jsonb_agg(jsonb_build_object('day', days.day, 'n', coalesce(x.n, 0)) order by days.day)
      from days
      left join (
        select (created_at at time zone 'Asia/Dubai')::date as day, count(*) as n
        from public.checks
        where newsroom_id = target_newsroom and created_at >= now() - interval '15 days'
        group by 1
      ) x on x.day = days.day
    ),
    'cost_usd', (
      select coalesce(round(sum(cost_usd), 2), 0) from public.usage_events
      where newsroom_id = target_newsroom and created_at >= month_start
    ),
    'monthly_check_limit', (select monthly_check_limit from public.newsrooms where id = target_newsroom)
  )
  into result;
  return result;
end;
$$;

-- ─── Alerts ───────────────────────────────────────────────────────────────────

create or replace function public.dismiss_alerts(alert_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.alerts a
  set dismissed_at = now(), read_at = coalesce(a.read_at, now())
  where a.dismissed_at is null
    and a.id = any (alert_ids)
    and (a.user_id = (select auth.uid()) or (a.user_id is null and public.is_member(a.newsroom_id)));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- ─── Briefs ───────────────────────────────────────────────────────────────────

-- Rebuild a brief from today's registry (same entity, topic and options).
create or replace function public.regenerate_brief(target_brief uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.briefs;
begin
  select * into b from public.briefs where id = target_brief;
  if b.id is null or not public.is_member(b.newsroom_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.briefs
  set status = 'generating', error = null,
      content = jsonb_build_object('options', coalesce(b.content -> 'options', '{}'::jsonb))
  where id = b.id;
  perform public.enqueue_job('generate_brief', jsonb_build_object('brief_id', b.id), 5, 'brief:' || b.id);
end;
$$;
