-- Default model per task (console → quality & models). Changing a task's model is a row update.
insert into public.model_settings (task, provider, model, effort, description_en, description_ar) values
  ('extract_claims',   'google', 'gemini-3.5-flash-lite', 'low', 'Find numerical claims and turn them into fields', 'استخراج الادعاءات الرقمية وتحويلها إلى حقول'),
  ('verify_claim',     'google', 'gemini-3.5-flash-lite', 'low', 'Independent check that evidence measures the same thing', 'تحقق مستقل من أن الشاهد يقيس الشيء نفسه'),
  ('discover_source',  'google', 'gemini-3.5-flash-lite', 'low', 'Search trusted sources when the registry has no match', 'البحث في المصادر الموثوقة عند غياب الرقم في السجل'),
  ('extract_figures',  'google', 'gemini-3.8-flash',      'low', 'Read official documents into registry figures', 'قراءة الوثائق الرسمية إلى أرقام في السجل'),
  ('suggest_wording',  'google', 'gemini-3.5-flash-lite', 'low', 'Polish the suggested Arabic wording', 'صياغة العبارة المقترحة بالعربية'),
  ('ask_registry',     'google', 'gemini-3.5-flash-lite', 'low', 'Answer questions from the registry only', 'الإجابة عن الأسئلة من السجل فقط'),
  ('generate_brief',   'google', 'gemini-3.5-flash-lite', 'low', 'Write interview briefs from registry figures', 'إعداد الإحاطات من أرقام السجل'),
  ('transcribe',       'google', 'gemini-3.5-transcribe', 'low', 'Speech-to-text with word timings and speakers', 'تحويل الكلام إلى نص مع توقيت الكلمات والمتحدثين')
on conflict (task) do nothing;
