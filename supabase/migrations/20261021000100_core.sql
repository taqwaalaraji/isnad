-- Core: people, newsrooms, roles, and the helpers every access policy builds on.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ─── Types ────────────────────────────────────────────────────────────────────

create type public.platform_role as enum ('none', 'curator', 'admin');
create type public.member_role as enum ('journalist', 'editor', 'admin');
create type public.member_status as enum ('active', 'deactivated');
create type public.organization_kind as enum ('newsroom', 'issuer');
create type public.check_visibility as enum ('private', 'desk', 'newsroom');
create type public.app_locale as enum ('ar', 'en');

-- ─── Text helpers ─────────────────────────────────────────────────────────────

-- Arabic-aware normalization for matching and search. Mirrors the worker's
-- `isnad_worker.text.normalize` (keep them in sync): unify alef forms, ى→ي, ة→ه,
-- Arabic-Indic and Persian digits and separators → 0-9 . , %, drop tatweel and diacritics, lowercase.
create function public.normalize_ar(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(
    regexp_replace(
      translate(
        coalesce(input, ''),
        'أإآٱىة٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬٪ـ',
        'اااايه01234567890123456789.,%'
      ),
      '[ً-ٰٟ]', '', 'g'
    )
  );
$$;

-- array_to_string is only STABLE in general; for text[] it is safe to treat as immutable,
-- which lets generated search columns use it.
create function public.join_text(parts text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_to_string(parts, ' '), '');
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── People ───────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  locale public.app_locale not null default 'ar',
  platform_role public.platform_role not null default 'none',
  notification_prefs jsonb not null default
    '{"in_app": true, "email": true, "telegram": true, "review_requests": true, "revisions": true, "follows": true}'::jsonb,
  last_newsroom_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every auth user gets a profile. Name comes from invite metadata when present.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, locale)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'locale')::public.app_locale, 'ar')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Newsrooms ────────────────────────────────────────────────────────────────

create table public.newsrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  kind public.organization_kind not null default 'newsroom',
  -- Policies (settings → policies)
  require_approval_for_differs boolean not null default true,
  escalate_on_verifier_objection boolean not null default true,
  default_visibility public.check_visibility not null default 'newsroom',
  media_retention_days integer not null default 90 check (media_retention_days between 1 and 3650),
  brand_isnad_note boolean not null default true,
  telegram_enabled boolean not null default true,
  -- Limits set by Isnad (console → newsrooms)
  monthly_check_limit integer,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger newsrooms_set_updated_at
  before update on public.newsrooms
  for each row execute function public.set_updated_at();

create table public.desks (
  id uuid primary key default gen_random_uuid(),
  newsroom_id uuid not null references public.newsrooms (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (newsroom_id, name)
);

create table public.memberships (
  newsroom_id uuid not null references public.newsrooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'journalist',
  desk_id uuid references public.desks (id) on delete set null,
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (newsroom_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint profiles_last_newsroom_fk
  foreign key (last_newsroom_id) references public.newsrooms (id) on delete set null;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  newsroom_id uuid not null references public.newsrooms (id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text not null default '',
  role public.member_role not null default 'journalist',
  desk_id uuid references public.desks (id) on delete set null,
  invited_by uuid references public.profiles (id) on delete set null,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index invitations_open_email_idx
  on public.invitations (newsroom_id, email)
  where accepted_at is null and revoked_at is null;

-- ─── Access helpers ───────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can consult memberships without recursive RLS.

create function public.current_platform_role()
returns public.platform_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.platform_role from public.profiles p where p.id = (select auth.uid())),
    'none'::public.platform_role
  );
$$;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_platform_role() in ('curator', 'admin');
$$;

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_platform_role() = 'admin';
$$;

create function public.is_member(target_newsroom uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.newsroom_id = target_newsroom
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function public.has_role(target_newsroom uuid, roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.newsroom_id = target_newsroom
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (roles)
  );
$$;

create function public.my_desk(target_newsroom uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.desk_id from public.memberships m
  where m.newsroom_id = target_newsroom
    and m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

-- Two users can see each other's names when they share an active newsroom.
create function public.shares_newsroom(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.newsroom_id = mine.newsroom_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = other_user
  );
$$;

-- ─── Invitations ──────────────────────────────────────────────────────────────

-- Accepting checks the token, that it's open, and that it was sent to the signed-in email.
create function public.accept_invitation(raw_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
  me public.profiles;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into inv from public.invitations
  where token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
  for update;

  if inv.id is null or inv.revoked_at is not null then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  if inv.accepted_at is not null then
    raise exception 'invitation_used' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;
  if lower(me.email) <> inv.email then
    raise exception 'invitation_wrong_account' using errcode = '42501';
  end if;

  insert into public.memberships (newsroom_id, user_id, role, desk_id)
  values (inv.newsroom_id, me.id, inv.role, inv.desk_id)
  on conflict (newsroom_id, user_id)
  do update set role = excluded.role, desk_id = excluded.desk_id, status = 'active';

  update public.invitations set accepted_at = now() where id = inv.id;

  if me.full_name = '' and inv.full_name <> '' then
    update public.profiles set full_name = inv.full_name where id = me.id;
  end if;
  update public.profiles set last_newsroom_id = inv.newsroom_id where id = me.id;

  return inv.newsroom_id;
end;
$$;

