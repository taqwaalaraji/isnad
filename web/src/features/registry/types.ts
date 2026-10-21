/** Shapes returned by the registry SQL functions (jsonb) and the worker's Ask endpoint. */

export type FigureValue = { value: number | string; scale: string; decimals: number; unit: string };

export type SearchIndicator = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  unit: string;
  frequency: string | null;
  topic_slug: string | null;
  topic_ar: string | null;
  topic_en: string | null;
  score: number;
};

export type SearchEntity = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  kind: string;
  level: string;
  score: number;
};

export type SearchDocument = {
  id: string;
  title: string;
  kind: string;
  published_at: string | null;
  source_ar: string;
  source_en: string;
  tier: 1 | 2 | 3;
  score: number;
};

export type SearchFigure = FigureValue & {
  id: string;
  measure: string;
  period_label: string;
  period_start: string;
  period_end: string;
  geography: string;
  breakdown: string | null;
  status: "preliminary" | "final" | "revised";
  document_id: string;
  indicator_slug: string;
  indicator_ar: string;
  indicator_en: string;
  tier: 1 | 2 | 3;
  source_ar: string;
  source_en: string;
};

export type SearchResults = {
  indicators: SearchIndicator[];
  entities: SearchEntity[];
  documents: SearchDocument[];
  figures: SearchFigure[];
};

export type RegistryStats = {
  figures: number;
  documents: number;
  indicators: number;
  topics: number;
  sources: number;
  tier1_sources: number;
  fresh_sources: number;
  last_fetched_at: string | null;
  last_figure_at: string | null;
};

export type FigureExcerpt =
  | { kind: "sheet"; sheet: string; focus: string; cells: Record<string, string | number> }
  | { kind: "page"; page: number; page_count: number; text: string }
  | { kind: "text"; found: boolean; text: string; truncated_start: boolean; truncated_end: boolean };

export type AskEvidence = {
  figure_id: string;
  document_id: string;
  document_title: string;
  document_url: string | null;
  version: number;
  fetched_at: string | null;
  published_at: string | null;
  source_name_ar: string;
  source_name_en: string;
  tier: 1 | 2 | 3;
  quote: string;
  quote_verified: boolean;
  location: { page?: number; sheet?: string; cell?: string; kind?: string };
  value: string;
  value_text: string;
  value_text_en: string;
  period_label_ar: string;
  period_label_en: string;
  status: "preliminary" | "final" | "revised";
  is_current: boolean;
  indicator_name_ar: string | null;
  indicator_name_en: string | null;
  earlier: Array<{
    value_text: string;
    value_text_en: string;
    period_label: string;
    status: string;
    fetched_at: string | null;
    document_title: string;
  }>;
};

export type AskAnswer = {
  answerable: boolean;
  answer: string;
  language: "ar" | "en";
  reason: string;
  citations: AskEvidence[];
  follow_ups: string[];
};
