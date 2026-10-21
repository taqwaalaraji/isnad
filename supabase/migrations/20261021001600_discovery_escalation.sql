-- Discovery reads a found document with Flash-Lite; when the figure it reads disagrees with the
-- claim (which would make the claim "differs"), Flash reads the same passages again first.
update public.model_settings
set escalation_model = 'gemini-3.8-flash', updated_at = now()
where task = 'discover_source' and escalation_model is null;
