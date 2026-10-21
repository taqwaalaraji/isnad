import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];

export type CheckRow = Tables["checks"]["Row"];
export type ClaimRow = Tables["claims"]["Row"];
export type ClaimResultRow = Tables["claim_results"]["Row"];
export type SegmentRow = Tables["segments"]["Row"];
export type MediaRow = Tables["media"]["Row"];
export type DecisionRow = Tables["decisions"]["Row"];
export type CommentRow = Tables["comments"]["Row"];
export type AlertRow = Tables["alerts"]["Row"];
export type FigureRow = Tables["figures"]["Row"];
export type IndicatorRow = Tables["indicators"]["Row"];
export type SourceRow = Tables["sources"]["Row"];
export type EntityRow = Tables["entities"]["Row"];
export type TopicRow = Tables["topics"]["Row"];

export type CheckStatus = Enums["check_status"];
export type CheckStage = Enums["check_stage"];
export type InputKind = Enums["input_kind"];
export type Verdict = Enums["verdict"];
export type ClaimReviewState = Enums["claim_review_state"];
export type AlertKind = Enums["alert_kind"];

/** Evidence as stored on a claim result by the worker. */
export type Evidence = {
  figure_id: string;
  document_version_id: string;
  document: { id: string; title: string; url: string | null; kind: string; version: number; fetched_at: string | null };
  source_name_ar: string;
  source_name_en: string;
  source_slug: string;
  /** The publishing body (the source's entity); older results may lack it. */
  publisher_name_ar?: string;
  publisher_name_en?: string;
  tier: 1 | 2 | 3;
  quote: string;
  location: { kind?: "cell" | "table" | "text"; page?: number; sheet?: string; cell?: string; row?: string; column?: string };
  value: string;
  value_text: string;
  value_text_en?: string;
  scale: string;
  decimals: number;
  unit: string;
  measure: string;
  period_label: string;
  period_label_ar?: string;
  period_label_en?: string;
  period_start: string;
  period_end: string;
  geography: string;
  breakdown: string | null;
  status: "preliminary" | "final" | "revised";
  indicator_name_ar: string | null;
  indicator_name_en: string | null;
  entity_name_ar: string | null;
  entity_name_en: string | null;
  review_status: string;
  closest?: boolean;
};

export type ChainNode = {
  kind: "official" | "relay" | "content" | "unknown";
  label_ar: string;
  label_en: string;
  value?: string;
  period?: string | null;
  tier?: number;
  changes?: string[];
};

export type VerifierNote = {
  agrees: boolean;
  issue: string;
  note_ar: string;
  note_en: string;
  confidence: "high" | "medium" | "low";
};

export type EarlierFigure = { value_text: string; period_label: string; status: string; fetched_at: string | null; document_title: string };

export type Word = { text: string; start_ms: number; end_ms: number; confidence: number | null };
