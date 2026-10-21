-- The public evidence page: approved numbers of a published check with their evidence, the publishing
-- body, and a notice when the official figure has been revised since publication.
create or replace function public.get_public_note(slug text)
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
          'id', cl.id,
          'text', cl.span_text,
          'verdict', r.verdict,
          'chain_status', r.chain_status,
          'chain', r.chain,
          'wording', case when cl.review_state = 'edited' then r.suggested_wording end,
          'evidence', r.evidence,
          'evidence_verified', r.evidence_verified,
          'differing_fields', r.differing_fields,
          'document', case when d.id is null then null else jsonb_build_object(
            'title', d.title, 'url', d.url, 'source', s.name_ar, 'source_en', s.name_en, 'tier', s.tier,
            'publisher', pe.name_ar, 'publisher_en', pe.name_en, 'fetched_at', v.fetched_at
          ) end,
          'revised', (
            select jsonb_build_object(
              'value', nf.value, 'scale', nf.scale, 'decimals', nf.decimals, 'unit', nf.unit,
              'period_label', nf.period_label, 'period_start', nf.period_start, 'period_end', nf.period_end,
              'at', nv.fetched_at
            )
            from public.figures nf
            join public.document_versions nv on nv.id = nf.document_version_id
            -- The series' current figure (the evidence may be one of several superseded copies).
            where f.is_current = false and nf.is_current and nf.review_status = 'approved'
              and nf.indicator_id = f.indicator_id and nf.measure = f.measure and nf.geography = f.geography
              and nf.period_start = f.period_start and nf.period_end = f.period_end
              and coalesce(nf.breakdown, '') = coalesce(f.breakdown, '')
              and nf.newsroom_id is not distinct from f.newsroom_id
              and nf.value_base <> f.value_base
              -- A revision is the same publisher restating the figure (see registry/revisions.py).
              and exists (
                select 1 from public.sources s1, public.sources s2
                where s1.id = f.source_id and s2.id = nf.source_id
                  and coalesce(s1.entity_id, s1.id) = coalesce(s2.entity_id, s2.id)
              )
            order by nv.fetched_at desc
            limit 1
          )
        ) order by cl.idx
      )
      from public.claims cl
      join public.claim_results r on r.claim_id = cl.id
      left join public.figures f on f.id = r.figure_id
      left join public.document_versions v on v.id = r.document_version_id
      left join public.documents d on d.id = v.document_id
      left join public.sources s on s.id = d.source_id
      left join public.entities pe on pe.id = s.entity_id
      where cl.check_id = c.id and cl.checkable and cl.review_state in ('approved', 'edited')
        and r.verdict <> 'none'
    ), '[]'::jsonb)
  )
  from public.checks c
  join public.newsrooms n on n.id = c.newsroom_id
  where c.public_slug = get_public_note.slug and c.status = 'published';
$$;

grant execute on function public.get_public_note(text) to anon, authenticated;
