-- Registry reads for the web app: ranked search, topic and coverage statistics, and the excerpt of
-- a stored document around one figure. All are SECURITY INVOKER, so row-level security decides what
-- each viewer sees (approved figures, shared sources, their newsroom's private sources).

-- How many days a source normally waits between releases; used to judge freshness.
create function public.update_cycle_days(frequency text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case frequency
    when 'daily' then 1
    when 'weekly' then 7
    when 'monthly' then 31
    when 'quarterly' then 92
    when 'annual' then 366
    else 92
  end;
$$;

-- A source is fresh when its last successful fetch is within one and a half release cycles.
create function public.source_is_fresh(last_fetched timestamptz, frequency text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select last_fetched is not null
     and last_fetched >= now() - make_interval(days => ceil(public.update_cycle_days(frequency) * 1.5)::integer + 1);
$$;

-- Headline numbers for the registry home and coverage pages.
create function public.registry_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'figures', (select count(*) from public.figures where review_status = 'approved'),
    'documents', (select count(*) from public.documents),
    'indicators', (select count(*) from public.indicators),
    'topics', (select count(*) from public.topics),
    'sources', (select count(*) from public.sources where status = 'active'),
    'tier1_sources', (select count(*) from public.sources where status = 'active' and tier = 1),
    'fresh_sources', (
      select count(*) from public.sources
      where status = 'active' and public.source_is_fresh(last_fetched_at, update_frequency)
    ),
    'last_fetched_at', (select max(fetched_at) from public.document_versions),
    'last_figure_at', (select max(created_at) from public.figures where review_status = 'approved')
  );
$$;

-- Per-topic coverage: indicators, sources, approved figures, freshness and the latest update.
create function public.registry_topic_stats()
returns table (
  id uuid,
  slug text,
  name_ar text,
  name_en text,
  icon text,
  sort_order integer,
  indicators integer,
  sources integer,
  fresh_sources integer,
  figures integer,
  last_updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id, t.slug, t.name_ar, t.name_en, t.icon, t.sort_order,
    (select count(*) from public.indicators i where i.topic_id = t.id)::integer,
    (
      select count(*) from public.source_topics st
      join public.sources s on s.id = st.source_id
      where st.topic_id = t.id and s.status = 'active'
    )::integer,
    (
      select count(*) from public.source_topics st
      join public.sources s on s.id = st.source_id
      where st.topic_id = t.id and s.status = 'active' and public.source_is_fresh(s.last_fetched_at, s.update_frequency)
    )::integer,
    (
      select count(*) from public.figures f
      join public.indicators i on i.id = f.indicator_id
      where i.topic_id = t.id and f.review_status = 'approved'
    )::integer,
    greatest(
      (
        select max(s.last_fetched_at) from public.source_topics st
        join public.sources s on s.id = st.source_id
        where st.topic_id = t.id
      ),
      (
        select max(f.created_at) from public.figures f
        join public.indicators i on i.id = f.indicator_id
        where i.topic_id = t.id and f.review_status = 'approved'
      )
    )
  from public.topics t
  order by t.sort_order, t.name_en;
$$;

-- True when every word of the query (2+ letters, leading "ال" ignored) appears in the text.
create function public.contains_all_words(haystack text, words text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(words, '') <> '' and not exists (
    select 1
    from unnest(string_to_array(words, ' ')) w
    where length(w) > 1
      and position(
        case when length(w) > 4 and w like 'ال%' then substr(w, 3) else w end
        in coalesce(haystack, '')
      ) = 0
  );
$$;

-- Ranked search across indicators, entities, documents and figures. A year in the query
-- ("الزوار 2025") narrows figures to periods that touch that year. Matches that contain every
-- query word come first; fuzzy (trigram) matches fill in only when nothing matches exactly.
create function public.registry_search(query text, max_rows integer default 8)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  q text := btrim(public.normalize_ar(coalesce(query, '')));
  year_text text := substring(q from '(?:^|\D)((?:19|20)\d{2})(?:\D|$)');
  words text;
  year_start date;
  year_end date;
  limit_rows integer := least(greatest(coalesce(max_rows, 8), 1), 50);
  result jsonb;
begin
  words := btrim(regexp_replace(q, '(?:19|20)\d{2}', ' ', 'g'));
  words := btrim(regexp_replace(words, '[^[:alnum:]%.]+', ' ', 'g'));
  if year_text is not null then
    year_start := make_date(year_text::integer, 1, 1);
    year_end := make_date(year_text::integer, 12, 31);
  end if;
  if words = '' and year_text is null then
    return jsonb_build_object('indicators', '[]'::jsonb, 'entities', '[]'::jsonb, 'documents', '[]'::jsonb, 'figures', '[]'::jsonb);
  end if;

  with
  ind_all as (
    select i.id, i.slug, i.name_ar, i.name_en, i.unit, i.frequency, t.slug as topic_slug, t.name_ar as topic_ar, t.name_en as topic_en,
           public.contains_all_words(i.search_text, words) as exact,
           greatest(extensions.word_similarity(words, i.search_text), extensions.similarity(words, i.search_text)) as score
    from public.indicators i
    left join public.topics t on t.id = i.topic_id
    where words <> ''
      and (public.contains_all_words(i.search_text, words) or extensions.word_similarity(words, i.search_text) > 0.5)
  ),
  ind as (
    select * from ind_all
    where exact or not exists (select 1 from ind_all where exact)
    order by exact desc, score desc, name_en
    limit limit_rows
  ),
  ent_all as (
    select e.id, e.slug, e.name_ar, e.name_en, e.kind, e.level,
           public.contains_all_words(e.search_text, words) as exact,
           greatest(extensions.word_similarity(words, e.search_text), extensions.similarity(words, e.search_text)) as score
    from public.entities e
    where words <> ''
      and (public.contains_all_words(e.search_text, words) or extensions.word_similarity(words, e.search_text) > 0.55)
  ),
  ent as (
    select * from ent_all
    where exact or not exists (select 1 from ent_all where exact)
    order by exact desc, score desc, name_en
    limit limit_rows
  ),
  doc as (
    select d.id, d.title, d.kind, d.published_at, s.name_ar as source_ar, s.name_en as source_en, s.tier,
           extensions.word_similarity(words, public.normalize_ar(d.title)) as score
    from public.documents d
    join public.sources s on s.id = d.source_id
    where words <> ''
      and public.contains_all_words(public.normalize_ar(d.title), words)
    order by score desc, d.published_at desc nulls last
    limit limit_rows
  ),
  fig as (
    select f.id, f.value, f.scale, f.decimals, f.unit, f.measure, f.period_label, f.period_start, f.period_end, f.geography,
           f.breakdown, f.status, f.document_id, i.slug as indicator_slug, i.name_ar as indicator_ar, i.name_en as indicator_en,
           s.tier, s.name_ar as source_ar, s.name_en as source_en
    from public.figures f
    join public.indicators i on i.id = f.indicator_id
    join public.sources s on s.id = f.source_id
    where f.review_status = 'approved'
      and f.is_current
      and (
        (words = '' and year_start is not null)
        or f.indicator_id in (select ind.id from ind order by ind.exact desc, ind.score desc limit 3)
        or public.contains_all_words(public.normalize_ar(f.quote), words)
      )
      and (year_start is null or (f.period_start <= year_end and f.period_end >= year_start))
    order by f.period_end desc, s.tier, f.created_at desc
    limit limit_rows * 2
  )
  select jsonb_build_object(
    'indicators', coalesce((select jsonb_agg(to_jsonb(ind) - 'exact' order by ind.exact desc, ind.score desc) from ind), '[]'::jsonb),
    'entities', coalesce((select jsonb_agg(to_jsonb(ent) - 'exact' order by ent.exact desc, ent.score desc) from ent), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(doc) order by doc.score desc) from doc), '[]'::jsonb),
    'figures', coalesce((select jsonb_agg(to_jsonb(fig) order by fig.period_end desc, fig.tier) from fig), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Column letters to a 1-based index: 'A' → 1, 'AB' → 28.
create function public.sheet_column_index(letters text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := 0;
  ch text;
begin
  foreach ch in array regexp_split_to_array(upper(letters), '')
  loop
    n := n * 26 + (ascii(ch) - 64);
  end loop;
  return n;
end;
$$;

-- The part of a stored document a figure was read from: the cells around a spreadsheet cell (with
-- the header rows and label column), the text of a PDF page, or the passage around the quote.
create function public.figure_excerpt(target_figure uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  f public.figures;
  v public.document_versions;
  loc jsonb;
  sheet jsonb;
  focus text;
  focus_col integer;
  focus_row integer;
  cells jsonb;
  page_no integer;
  pages jsonb;
  pos integer;
  body text;
begin
  select * into f from public.figures where id = target_figure;
  if f.id is null then
    return null;
  end if;
  select * into v from public.document_versions where id = f.document_version_id;
  if v.id is null then
    return null;
  end if;
  loc := coalesce(f.location, '{}'::jsonb);

  -- Spreadsheet cell: rows ±6 and columns −5…+3 around it, plus the first three rows and column A.
  focus := upper(loc ->> 'cell');
  if focus ~ '^[A-Z]{1,3}[0-9]{1,6}$' then
    select t into sheet
    from jsonb_array_elements(v.tables) t
    where t ->> 'kind' = 'sheet' and (loc ->> 'sheet' is null or t ->> 'sheet' = loc ->> 'sheet')
    limit 1;
    if sheet is not null then
      focus_col := public.sheet_column_index(substring(focus from '^[A-Z]+'));
      focus_row := substring(focus from '[0-9]+$')::integer;
      select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb) into cells
      from jsonb_each(sheet -> 'cells') c
      cross join lateral (
        select public.sheet_column_index(substring(c.key from '^[A-Z]+')) as col,
               substring(c.key from '[0-9]+$')::integer as rw
      ) p
      where (p.rw between focus_row - 6 and focus_row + 6 or p.rw <= 3)
        and (p.col between focus_col - 5 and focus_col + 3 or p.col = 1);
      return jsonb_build_object('kind', 'sheet', 'sheet', sheet ->> 'sheet', 'focus', focus, 'cells', cells);
    end if;
  end if;

  -- PDF page text.
  select t -> 'pages' into pages from jsonb_array_elements(v.tables) t where t ->> 'kind' = 'pdf_pages' limit 1;
  page_no := nullif(loc ->> 'page', '')::integer;
  if pages is not null and page_no is not null and page_no between 1 and jsonb_array_length(pages) then
    return jsonb_build_object(
      'kind', 'page', 'page', page_no, 'page_count', jsonb_array_length(pages),
      'text', left(pages ->> (page_no - 1), 6000)
    );
  end if;

  -- Plain text: the passage around the quote (or the start of the document).
  body := coalesce(v.text_content, '');
  pos := strpos(body, f.quote);
  if pos = 0 then
    pos := strpos(body, left(f.quote, 40));
  end if;
  return jsonb_build_object(
    'kind', 'text',
    'found', pos > 0,
    'text', case
      when pos > 0 then substr(body, greatest(1, pos - 700), length(f.quote) + 1400)
      else left(body, 1500)
    end,
    'truncated_start', pos > 701,
    'truncated_end', length(body) > (case when pos > 0 then pos + length(f.quote) + 700 else 1500 end)
  );
end;
$$;

-- Signed-in users only (RLS still filters what each one sees).
revoke execute on function public.registry_stats() from public, anon;
revoke execute on function public.registry_topic_stats() from public, anon;
revoke execute on function public.registry_search(text, integer) from public, anon;
revoke execute on function public.figure_excerpt(uuid) from public, anon;
grant execute on function public.registry_stats() to authenticated;
grant execute on function public.registry_topic_stats() to authenticated;
grant execute on function public.registry_search(text, integer) to authenticated;
grant execute on function public.figure_excerpt(uuid) to authenticated;
