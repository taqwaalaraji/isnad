/** Fixed vocabularies for console forms (mirrors the database enums and checks). */

export const SOURCE_TYPES = ["statistics_portal", "open_data_portal", "publications", "press_releases", "news_agency"] as const;
export const ACCESS_METHODS = ["pdf", "excel", "csv", "html", "api", "dashboard"] as const;
export const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "annual", "irregular"] as const;

export const ENTITY_KINDS = [
  "statistics_office",
  "ministry",
  "authority",
  "central_bank",
  "government_department",
  "news_agency",
  "media_office",
  "open_data_portal",
  "exchange",
  "international_org",
  "other",
] as const;
export const ENTITY_LEVELS = ["federal", "emirate", "international", "other"] as const;
export const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"] as const;

export const UNIT_KINDS = ["count", "currency", "percent", "ratio", "index", "rate", "duration", "area", "volume", "weight", "energy", "other"] as const;
export const SCALES = ["one", "thousand", "million", "billion", "trillion"] as const;
export const MEASURES = ["level", "growth_yoy", "growth_qoq", "growth", "share", "rank", "change"] as const;
export const GEOGRAPHIES = ["UAE", "Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"] as const;

/** Gemini models a task may use (the worker knows their prices). Transcription has its own model. */
export const TEXT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-flash-lite"] as const;
export const TRANSCRIBE_MODELS = ["gemini-3.5-transcribe"] as const;

export function modelChoices(task: string): readonly string[] {
  return task === "transcribe" ? TRANSCRIBE_MODELS : TEXT_MODELS;
}

export const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;

/** Tasks that can ask a stronger model again when code checks reject the cheap answer. */
export const ESCALATING_TASKS = ["extract_claims", "verify_claim", "discover_source", "extract_figures", "ask_registry"] as const;

/** Tasks the pipeline can run without (it falls back to rules or templates). */
export const OPTIONAL_TASKS = ["discover_source", "verify_claim", "suggest_wording", "ask_registry", "generate_brief"] as const;

/** A stored text value narrowed to a vocabulary (unknown values are dropped). */
export function oneOf<T extends string>(list: readonly T[], value: string | null | undefined): T | null {
  return value && (list as readonly string[]).includes(value) ? (value as T) : null;
}

export function someOf<T extends string>(list: readonly T[], values: readonly string[]): T[] {
  return values.filter((v): v is T => (list as readonly string[]).includes(v));
}

export const GEOGRAPHY_AR: Record<string, string> = {
  UAE: "الإمارات",
  "Abu Dhabi": "أبوظبي",
  Dubai: "دبي",
  Sharjah: "الشارقة",
  Ajman: "عجمان",
  "Umm Al Quwain": "أم القيوين",
  "Ras Al Khaimah": "رأس الخيمة",
  Fujairah: "الفجيرة",
};
