-- Newsroom review policies.
--   require_approval_for_differs: every "differs" number needs its own decision before the check can be
--     approved; other pending numbers are approved with the check. Off: approving the check approves all.
--   escalate_on_verifier_objection: numbers the automatic verifier disagrees with are escalated when
--     processing finishes (the worker applies it); off: they are only flagged "needs review".
-- Escalated numbers always block approval.
create or replace function public.approve_check(target_check uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.checks;
  strict_differs boolean;
  pending_differs integer;
  escalated integer;
begin
  select * into ch from public.checks where id = target_check;
  if ch.id is null or not public.can_decide_check(target_check) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if ch.status not in ('awaiting_review', 'in_review') then
    raise exception 'check_not_reviewable' using errcode = 'P0001';
  end if;
  select require_approval_for_differs into strict_differs from public.newsrooms where id = ch.newsroom_id;

  select count(*) filter (where cl.review_state = 'pending' and r.verdict = 'differs'),
         count(*) filter (where cl.review_state = 'escalated')
  into pending_differs, escalated
  from public.claims cl
  left join public.claim_results r on r.claim_id = cl.id
  where cl.check_id = target_check and cl.checkable;

  if escalated > 0 then
    raise exception 'claims_escalated' using errcode = 'P0001';
  end if;
  if strict_differs and pending_differs > 0 then
    raise exception 'claims_pending' using errcode = 'P0001';
  end if;

  with approved as (
    update public.claims set review_state = 'approved'
    where check_id = target_check and checkable and review_state = 'pending'
    returning id
  )
  insert into public.decisions (check_id, claim_id, user_id, action, note)
  select target_check, id, (select auth.uid()), 'approve', 'approved_with_check' from approved;

  update public.checks set status = 'approved' where id = target_check;
  insert into public.decisions (check_id, user_id, action) values (target_check, (select auth.uid()), 'approve_check');
  perform public.refresh_check_counts(target_check);
end;
$$;
