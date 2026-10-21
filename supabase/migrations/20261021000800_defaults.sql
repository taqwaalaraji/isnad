-- Default model per task (console → quality & models). Changing a task's model is a row update.
insert into public.model_settings (task, provider, model, effort, description_en, description_ar) values
  ('extract_claims',   'anthropic', 'claude-opus-5-5', 'medium', 'Find numerical claims and turn them into fields', 'استخراج الادعاءات الرقمية وتحويلها إلى حقول'),
  ('verify_claim',     'anthropic', 'claude-opus-5-5', 'high',   'Independent check that evidence measures the same thing', 'تحقق مستقل من أن الشاهد يقيس الشيء نفسه'),
  ('discover_source',  'anthropic', 'claude-opus-5-5', 'high',   'Search trusted sources when the registry has no match', 'البحث في المصادر الموثوقة عند غياب الرقم في السجل'),
  ('extract_figures',  'anthropic', 'claude-opus-5-5', 'medium', 'Read official documents into registry figures', 'قراءة الوثائق الرسمية إلى أرقام في السجل'),
  ('suggest_wording',  'anthropic', 'claude-opus-5-5', 'low',    'Polish the suggested Arabic wording', 'صياغة العبارة المقترحة بالعربية'),
  ('ask_registry',     'anthropic', 'claude-opus-5-5', 'medium', 'Answer questions from the registry only', 'الإجابة عن الأسئلة من السجل فقط'),
  ('generate_brief',   'anthropic', 'claude-opus-5-5', 'medium', 'Write interview briefs from registry figures', 'إعداد الإحاطات من أرقام السجل'),
  ('transcribe',       'google',    'chirp_3',         'medium', 'Speech-to-text with word timings', 'تحويل الكلام إلى نص مع توقيت الكلمات')
on conflict (task) do nothing;
