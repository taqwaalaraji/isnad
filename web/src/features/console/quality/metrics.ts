/** Reading eval run metrics defensively (runs in progress carry only {progress, of}). */

export type VerdictKey = "match" | "context" | "differs" | "none";
export const VERDICT_KEYS: VerdictKey[] = ["match", "differs", "context", "none"];

export type RunMetrics = {
  total: number | null;
  accuracy: number | null;
  abstention: { correct: number; total: number } | null;
  evidenceVerified: number | null;
  cost: number | null;
  byVerdict: Partial<Record<VerdictKey, number>>;
  progress: { done: number; total: number } | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function readMetrics(raw: unknown): RunMetrics {
  const m = (raw ?? {}) as Record<string, unknown>;
  const confusion = (m.confusion ?? {}) as Record<string, Record<string, number>>;
  const byVerdictRaw = (m.by_verdict ?? {}) as Record<string, { recall?: number } | number>;
  const byVerdict: RunMetrics["byVerdict"] = {};
  for (const v of VERDICT_KEYS) {
    const entry = byVerdictRaw[v];
    const value = typeof entry === "number" ? entry : num(entry?.recall);
    if (value !== null) byVerdict[v] = value;
  }
  const noneRow = confusion.none;
  const abstentionTotal = noneRow ? Object.values(noneRow).reduce((a, b) => a + b, 0) : 0;
  return {
    total: num(m.total),
    accuracy: num(m.accuracy),
    abstention: noneRow && abstentionTotal ? { correct: noneRow.none ?? 0, total: abstentionTotal } : null,
    evidenceVerified: num(m.evidence_verified_rate),
    cost: num(m.cost_usd),
    byVerdict,
    progress: num(m.progress) !== null && num(m.of) !== null ? { done: num(m.progress)!, total: num(m.of)! } : null,
  };
}

type TaskSetup = { model?: string; effort?: string; escalation?: string | null; enabled?: boolean };

/** A short label for a run's setup: the extraction model (and its escalation), the verifier, or the dataset. */
export function runLabel(settings: unknown, dataset: string): string {
  const s = (settings ?? {}) as Record<string, TaskSetup | undefined>;
  const extract = s.extract_claims;
  if (!extract?.model) return dataset;
  const short = (m: string) => m.replace(/^gemini-/, "").replace(/^claude-/, "");
  const parts = [extract.escalation ? `${short(extract.model)} → ${short(extract.escalation)}` : short(extract.model)];
  if (s.verify_claim?.enabled === false) parts.push("no verifier");
  return parts.join(" · ");
}

export function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 1000) / 10}%`;
}
