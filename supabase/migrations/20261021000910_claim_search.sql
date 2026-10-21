-- Search official sources for one number on demand (numbers past a check's search budget, or a retry
-- after the registry grew). The check stays in review; only that number's result changes.
create function public.request_claim_search(target_claim uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cl public.claims;
  ch public.checks;
begin
  select * into cl from public.claims where id = target_claim;
  if cl.id is null then
    raise exception 'claim_not_found' using errcode = 'P0002';
  end if;
  select * into ch from public.checks where id = cl.check_id;
  if not public.can_edit_check(ch.id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if ch.status in ('processing', 'archived', 'failed', 'published') then
    raise exception 'check_not_reviewable' using errcode = 'P0001';
  end if;

  update public.claim_results
  set comparison = coalesce(comparison, '{}'::jsonb) || '{"search": "queued"}'::jsonb
  where claim_id = cl.id;

  perform public.enqueue_job(
    'process_check',
    jsonb_build_object('check_id', ch.id, 'mode', 'claim', 'claim_id', cl.id),
    20,
    'claim:' || cl.id
  );
end;
$$;

revoke execute on function public.request_claim_search(uuid) from public, anon;
grant execute on function public.request_claim_search(uuid) to authenticated;
