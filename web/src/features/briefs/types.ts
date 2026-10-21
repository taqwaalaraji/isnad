/** What the worker writes into briefs.content (older briefs may lack the newer fields). */
export type BriefOptions = { period_months: number; revisions: boolean; statements: boolean; questions: boolean };

export type BriefFigure = {
  id: string;
  indicator: string;
  indicator_id?: string;
  value: string;
  measure: string;
  period: string;
  geography: string;
  breakdown: string | null;
  status: string;
  revised: boolean;
  source: string;
  document: string;
  document_id?: string;
  fetched_at?: string | null;
};

export type BriefContent = {
  options?: Partial<BriefOptions>;
  generated_at?: number;
  generated_from?: number;
  figures?: BriefFigure[];
  summary?: string;
  highlights?: Array<{ figure_id: string; note: string }>;
  questions?: Array<{ question: string; figure_ids: string[] }>;
  revisions?: Array<{
    figure_id: string;
    indicator: string;
    period: string;
    value: string;
    previous_value: string;
    document_id: string;
    revised_at: string | null;
  }>;
  statements?: Array<{
    claim_id: string;
    check_id: string;
    check_title: string;
    span: string;
    speaker: string | null;
    date: string | null;
    verdict: "match" | "context" | "differs" | "none" | null;
  }>;
};

export const PERIODS = [3, 6, 12, 24] as const;
