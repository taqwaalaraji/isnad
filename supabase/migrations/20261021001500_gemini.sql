-- Every model task runs on the Gemini API. Tasks start on Flash-Lite; those with an escalation
-- model ask Flash again only when code checks reject the cheap answer (and only with the part
-- that failed). Figure extraction reads each registry document once, where Flash's recall is
-- worth its price (Flash-Lite missed most figures of dense pages). Speech goes to Gemini
-- Transcribe (word timings and speakers).

alter table public.model_settings
  drop constraint model_settings_effort_check,
  add column escalation_model text,
  alter column provider set default 'google';

update public.model_settings m
set provider = 'google',
    model = d.model,
    effort = d.effort,
    escalation_model = d.escalation_model,
    max_tokens = null,
    description_en = coalesce(d.description_en, m.description_en),
    description_ar = coalesce(d.description_ar, m.description_ar),
    updated_at = now()
from (values
  ('extract_claims',  'gemini-3.5-flash-lite', 'low',     'gemini-3.8-flash', null, null),
  ('verify_claim',    'gemini-3.5-flash-lite', 'low',     'gemini-3.8-flash', null, null),
  ('discover_source', 'gemini-3.5-flash-lite', 'low',     null,               null, null),
  ('extract_figures', 'gemini-3.8-flash',      'low',     null,               null, null),
  ('suggest_wording', 'gemini-3.5-flash-lite', 'minimal', null,               null, null),
  ('ask_registry',    'gemini-3.5-flash-lite', 'low',     'gemini-3.8-flash', null, null),
  ('generate_brief',  'gemini-3.5-flash-lite', 'low',     null,               null, null),
  ('transcribe',      'gemini-3.5-transcribe', 'minimal', null,
    'Speech-to-text with word timings and speakers', 'تحويل الكلام إلى نص مع توقيت الكلمات والمتحدثين')
) as d (task, model, effort, escalation_model, description_en, description_ar)
where m.task = d.task;

alter table public.model_settings
  alter column effort set default 'low',
  add constraint model_settings_effort_check check (effort in ('minimal', 'low', 'medium', 'high')),
  add constraint model_settings_escalation_differs check (escalation_model is distinct from model);

-- Google Search grounding is billed per query, so usage keeps the count.
alter table public.usage_events
  add column search_queries integer not null default 0;
