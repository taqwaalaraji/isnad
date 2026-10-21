-- Check workflow: decisions, review, approval, publishing, re-checks.
-- All state changes go through these functions so authorization and status rules live in one place.

-- Recompute a check's counters and review status from its claims.
create function public.refresh_check_counts(target_check uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.checks;
  any_escalated boolean;
begin
  select * into c from public.checks where id = target_check for update;
  if c.id is null then
    return;
  end if;

  update public.checks set
    claim_count = (select count(*) from public.claims where check_id = target_check and checkable),
    match_count = (select count(*) from public.claim_results where check_id = target_check and verdict = 'match'),
    context_count = (select count(*) from public.claim_results where check_id = target_check and verdict = 'context'),
    differs_count = (select count(*) from public.claim_results where check_id = target_check and verdict = 'differs'),
    none_count = (select count(*) from public.claim_results where check_id = target_check and verdict = 'none'),
    decided_count = (
      select count(*) from public.claims
      where check_id = target_check and checkable and review_state <> 'pending'
    )
  where id = target_check;

  select exists (
    select 1 from public.claims where check_id = target_check and review_state = 'escalated'
  ) into any_escalated;

  if c.status in ('awaiting_review', 'in_review', 'escalated') then
    update public.checks
    set status = case
      when any_escalated then 'escalated'::public.check_status
      when c.status = 'escalated' then 'in_review'::public.check_status
      else c.status
    end
    where id = target_check;
  end if;
end;
$$;

revoke execute on function public.refresh_check_counts(uuid) from public, anon, authenticated;

create function public.decide_claim(target_claim uuid, decision public.decision_action, note text default null, wording text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cl public.claims;
  ch public.checks;
  new_state public.claim_review_state;
begin
  select * into cl from public.claims where id = target_claim;
  if cl.id is null then
    raise exception 'claim_not_found' using errcode = 'P0002';
  end if;
  select * into ch from public.checks where id = cl.check_id;

  if not public.can_decide_check(ch.id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if ch.status in ('processing', 'archived', 'failed') then
    raise exception 'check_not_reviewable' using errcode = 'P0001';
  end if;

  new_state := case decision
    when 'approve' then 'approved'::public.claim_review_state
    when 'edit' then 'edited'::public.claim_review_state
    when 'escalate' then 'escalated'::public.claim_review_state
    when 'reopen' then 'pending'::public.claim_review_state
    else null
  end;
  if new_state is null then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if decision = 'edit' and coalesce(btrim(wording), '') = '' then
    raise exception 'wording_required' using errcode = '22023';
  end if;

  update public.claims set review_state = new_state where id = cl.id;

  if decision = 'edit' then
    update public.claim_results set suggested_wording = wording where claim_id = cl.id;
  end if;

  insert into public.decisions (check_id, claim_id, user_id, action, note, wording)
  values (ch.id, cl.id, (select auth.uid()), decision, nullif(btrim(note), ''), nullif(btrim(wording), ''));

  -- Any decision moves a waiting or approved check back into review.
  update public.checks
  set status = 'in_review'
  where id = ch.id and status in ('awaiting_review', 'approved');

  perform public.refresh_check_counts(ch.id);

  if decision = 'escalate' then
    insert into public.alerts (newsroom_id, user_id, kind, title, body, payload)
    select ch.newsroom_id, recipient, 'check_escalated', ch.title, nullif(btrim(note), ''),
           jsonb_build_object('check_id', ch.id, 'claim_id', cl.id)
    from (
      select distinct unnest(array[ch.assigned_editor_id, ch.created_by]) as recipient
    ) r
    where recipient is not null and recipient <> (select auth.uid());
  end if;
end;
$$;

-- Approve every claim that matches its source and wasn't flagged by the verifier.
create function public.approve_matches(target_check uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  approved integer;
begin
  if not public.can_decide_check(target_check) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  with picked as (
    select cl.id
    from public.claims cl
    join public.claim_results r on r.claim_id = cl.id
    where cl.check_id = target_check
      and cl.review_state = 'pending'
      and r.verdict = 'match'
      and not r.needs_review
  ), updated as (
    update public.claims set review_state = 'approved'
    where id in (select id from picked)
    returning id
  )
  insert into public.decisions (check_id, claim_id, user_id, action, note)
  select target_check, id, (select auth.uid()), 'approve', 'approve_matches' from updated;

  get diagnostics approved = row_count;

  if approved > 0 then
    update public.checks set status = 'in_review'
    where id = target_check and status in ('awaiting_review', 'approved');
    perform public.refresh_check_counts(target_check);
  end if;
  return approved;
end;
$$;

create function public.send_for_review(target_check uuid, editor uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.checks;
begin
  select * into ch from public.checks where id = target_check;
  if ch.id is null or not public.can_edit_check(target_check) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if ch.status in ('processing', 'failed', 'archived', 'published') then
    raise exception 'check_not_reviewable' using errcode = 'P0001';
  end if;
  if editor is not null and not exists (
    select 1 from public.memberships
    where newsroom_id = ch.newsroom_id and user_id = editor and status = 'active' and role in ('editor', 'admin')
  ) then
    raise exception 'editor_invalid' using errcode = '22023';
  end if;

  update public.checks
  set assigned_editor_id = coalesce(editor, assigned_editor_id),
      status = case when status = 'approved' then 'in_review' else status end
  where id = target_check;

  insert into public.decisions (check_id, user_id, action)
  values (target_check, (select auth.uid()), 'send_for_review');

  insert into public.alerts (newsroom_id, user_id, kind, title, payload)
  select ch.newsroom_id, m.user_id, 'review_requested', ch.title, jsonb_build_object('check_id', ch.id)
  from public.memberships m
  where m.newsroom_id = ch.newsroom_id
    and m.status = 'active'
    and m.user_id <> (select auth.uid())
    and (
      (editor is not null and m.user_id = editor)
      or (editor is null and m.role in ('editor', 'admin') and (ch.desk_id is null or m.desk_id = ch.desk_id or m.role = 'admin'))
    );
end;
$$;

create function public.approve_check(target_check uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.checks;
  pending integer;
  escalated integer;
begin
  select * into ch from public.checks where id = target_check;
  if ch.id is null or not public.can_decide_check(target_check) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if ch.status not in ('awaiting_review', 'in_review') then
    raise exception 'check_not_reviewable' using errcode = 'P0001';
  end if;

  select count(*) filter (where review_state = 'pending'),
         count(*) filter (where review_state = 'escalated')
  into pending, escalated
  from public.claims where check_id = target_check and checkable;

  if pending > 0 then
    raise exception 'claims_pending' using errcode = 'P0001';
  end if;
  if escalated > 0 then
    raise exception 'claims_escalated' using errcode = 'P0001';
  end if;

  update public.checks set status = 'approved' where id = target_check;
  insert into public.decisions (check_id, user_id, action) values (target_check, (select auth.uid()), 'approve_check');
end;
$$;

create function public.publish_check(target_check uuid, url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.checks;
  slug text;
begin
  select * into ch from public.checks where id = target_check;
  if ch.id is null or not public.can_decide_check(target_check) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if ch.status not in ('approved', 'published') then
    raise exception 'check_not_approved' using errcode = 'P0001';
  end if;
  if url is null or url !~* '^https?://[^\s]+$' then
    raise exception 'url_invalid' using errcode = '22023';
  end if;

  slug := coalesce(ch.public_slug, lower(encode(extensions.gen_random_bytes(6), 'hex')));

  insert into public.publications (check_id, url, created_by) values (target_check, url, (select auth.uid()));

  update public.checks
  set status = 'published', published_url = url, published_at = coalesce(published_at, now()), public_slug = slug
  where id = target_check;

  insert into public.decisions (check_id, user_id, action, note) values (target_check, (select auth.uid()), 'publish', url);
  return slug;
end;
$$;

create function public.archive_check(target_check uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_check(target_check) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- Archiving a processing check cancels it: the worker stops at its next step and never overwrites the status.
  update public.checks set status = 'archived', archived_at = now() where id = target_check and status <> 'archived';
  if found then
    insert into public.decisions (check_id, user_id, action) values (target_check, (select auth.uid()), 'archive');
  end if;
end;
$$;

-- Re-run comparison against today's registry (keeps the transcript).
create function public.request_recheck(target_check uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.checks;
begin
  select * into ch from public.checks where id = target_check;
  if ch.id is null or not public.can_edit_check(target_check) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if ch.status = 'processing' then
    raise exception 'check_processing' using errcode = 'P0001';
  end if;
  if ch.status = 'archived' then
    raise exception 'check_not_editable' using errcode = 'P0001';
  end if;

  update public.checks
  set status = 'processing', stage = 'queued', error = null, progress = '{}'::jsonb
  where id = target_check;

  insert into public.decisions (check_id, user_id, action) values (target_check, (select auth.uid()), 'recheck');
  -- A check that failed before its content was read starts over; otherwise only the comparison runs again.
  perform public.enqueue_job(
    'process_check',
    jsonb_build_object(
      'check_id', target_check,
      'mode', case
        when ch.status = 'failed' and not exists (select 1 from public.segments where check_id = target_check) then 'full'
        else 'recheck'
      end
    ),
    10,
    'check:' || target_check
  );
end;
$$;

-- Fix a transcript segment; the claims in it are extracted and checked again.
create function public.update_segment(target_segment uuid, new_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  seg public.segments;
begin
  select * into seg from public.segments where id = target_segment;
  if seg.id is null or not public.can_edit_check(seg.check_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if coalesce(btrim(new_text), '') = '' then
    raise exception 'text_required' using errcode = '22023';
  end if;
  if exists (select 1 from public.checks where id = seg.check_id and status in ('processing', 'published', 'archived')) then
    raise exception 'check_not_editable' using errcode = 'P0001';
  end if;

  update public.segments
  set text = new_text, edited_by = (select auth.uid()), edited_at = now(), low_confidence = false
  where id = target_segment;

  update public.checks set status = 'processing', stage = 'extracting' where id = seg.check_id;
  perform public.enqueue_job(
    'process_check',
    jsonb_build_object('check_id', seg.check_id, 'mode', 'segment', 'segment_id', target_segment),
    10,
    'check:' || seg.check_id
  );
end;
$$;

-- ─── Telegram linking ─────────────────────────────────────────────────────────

-- Returns a one-time token for the deep link t.me/<bot>?start=<token>; only its hash is stored.
create function public.create_telegram_link_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw text;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.telegram_link_tokens where user_id = (select auth.uid()) and used_at is null;
  raw := encode(extensions.gen_random_bytes(18), 'hex');
  insert into public.telegram_link_tokens (token_hash, user_id)
  values (encode(extensions.digest(raw, 'sha256'), 'hex'), (select auth.uid()));
  return raw;
end;
$$;

-- ─── Alerts ───────────────────────────────────────────────────────────────────

create function public.mark_alerts_read(alert_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.alerts a
  set read_at = now()
  where a.read_at is null
    and (alert_ids is null or a.id = any (alert_ids))
    and (a.user_id = (select auth.uid()) or (a.user_id is null and public.is_member(a.newsroom_id)));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- ─── Public isnad note ────────────────────────────────────────────────────────

-- The reader-facing evidence page for a published check: only what the newsroom published.
create function public.get_public_note(slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', c.title,
    'newsroom', n.name,
    'brand', n.brand_isnad_note,
    'published_url', c.published_url,
    'published_at', c.published_at,
    'recorded_at', c.recorded_at,
    'claims', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'text', cl.span_text,
          'verdict', r.verdict,
          'chain_status', r.chain_status,
          'wording', r.suggested_wording,
          'evidence', r.evidence,
          'differing_fields', r.differing_fields,
          'document', case when d.id is null then null else jsonb_build_object(
            'title', d.title, 'url', d.url, 'source', s.name_ar, 'source_en', s.name_en, 'tier', s.tier,
            'fetched_at', v.fetched_at
          ) end
        ) order by cl.idx
      )
      from public.claims cl
      join public.claim_results r on r.claim_id = cl.id
      left join public.document_versions v on v.id = r.document_version_id
      left join public.documents d on d.id = v.document_id
      left join public.sources s on s.id = d.source_id
      where cl.check_id = c.id and cl.checkable and cl.review_state in ('approved', 'edited')
    ), '[]'::jsonb)
  )
  from public.checks c
  join public.newsrooms n on n.id = c.newsroom_id
  where c.public_slug = slug and c.status = 'published';
$$;

grant execute on function public.get_public_note(text) to anon, authenticated;
