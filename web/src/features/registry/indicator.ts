import { differsBeyondRounding, granularity, type Granularity } from "./format";
import type { FigureRow } from "./queries";

export type ChartPoint = {
  id: string;
  start: string;
  end: string;
  base: number;
  value: number;
  scale: string;
  decimals: number;
  unit: string;
  status: FigureRow["status"];
  revised: boolean;
  fetchedAt: string | null;
  documentId: string;
  documentTitle: string;
};

export type YearOverYear =
  | { kind: "official"; change: number; figure: FigureRow }
  | { kind: "computed"; change: number; previous: FigureRow }
  | null;

const ORDER: Granularity[] = ["quarter", "year", "month", "half", "range"];

const sameScope = (f: FigureRow, geography: string) => f.geography === geography && !f.breakdown;

/** The figure this one replaced, when the replacement changed the number (a re-read of the same number isn't a revision). */
export function revisedFrom(figure: FigureRow, byId: Map<string, FigureRow>): FigureRow | null {
  const previous = figure.supersedes_id ? byId.get(figure.supersedes_id) : undefined;
  return previous && differsBeyondRounding(previous, figure) ? previous : null;
}

function shiftYear(day: string, years: number): string {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  // Keep month ends at month ends (Feb 29 → Feb 28).
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

function byLatest(a: FigureRow, b: FigureRow): number {
  return b.period_end.localeCompare(a.period_end) || a.period_start.localeCompare(b.period_start) * -1 || b.created_at.localeCompare(a.created_at);
}

/** Everything the indicator page shows, derived from its approved figures. */
export function buildIndicatorView(figures: FigureRow[], { geography: requested, defaultGeography }: { geography?: string; defaultGeography: string }) {
  const counts = new Map<string, number>();
  for (const f of figures) if (!f.breakdown) counts.set(f.geography, (counts.get(f.geography) ?? 0) + 1);
  const geographies = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
  const geography =
    (requested && counts.has(requested) && requested) || (counts.has(defaultGeography) ? defaultGeography : (geographies[0] ?? defaultGeography));

  const byId = new Map(figures.map((f) => [f.id, f]));
  const levels = figures.filter((f) => f.measure === "level" && f.is_current && sameScope(f, geography));

  // One point per period (prefer the stronger source, then the newest), grouped by kind of period.
  const series = new Map<Granularity, ChartPoint[]>();
  const seen = new Map<string, FigureRow>();
  for (const f of [...levels].sort((a, b) => (a.source?.tier ?? 3) - (b.source?.tier ?? 3) || b.created_at.localeCompare(a.created_at))) {
    const key = `${f.period_start}:${f.period_end}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  for (const f of seen.values()) {
    const kind = granularity(f.period_start, f.period_end);
    const list = series.get(kind) ?? [];
    list.push({
      id: f.id,
      start: f.period_start,
      end: f.period_end,
      base: Number(f.value_base),
      value: Number(f.value),
      scale: f.scale,
      decimals: f.decimals,
      unit: f.unit,
      status: f.status,
      revised: f.status === "revised" || !!revisedFrom(f, byId),
      fetchedAt: f.version?.fetched_at ?? null,
      documentId: f.document_id,
      documentTitle: f.document?.title ?? "",
    });
    series.set(kind, list);
  }
  for (const list of series.values()) list.sort((a, b) => a.end.localeCompare(b.end));
  const granularities = ORDER.filter((g) => (series.get(g)?.length ?? 0) > 0);
  const defaultGranularity = granularities.find((g) => (series.get(g)?.length ?? 0) >= 2) ?? granularities[0] ?? "year";

  // Latest: the most recent period end; on ties the shorter period (the quarter, not the year to date).
  const latest = [...levels].sort(byLatest)[0] ?? null;
  const latestKind = latest ? granularity(latest.period_start, latest.period_end) : null;

  // Year to date (Jan 1 → the latest period end), when the latest figure is shorter than that.
  const ytd =
    latest && latestKind !== "year"
      ? (levels.find((f) => f.period_end === latest.period_end && f.period_start === `${latest.period_end.slice(0, 4)}-01-01` && f.id !== latest.id) ?? null)
      : null;
  const latestYear = latestKind !== "year" ? ([...levels].filter((f) => granularity(f.period_start, f.period_end) === "year").sort(byLatest)[0] ?? null) : null;

  // Year on year: an official growth figure for the same period if there is one, else computed from two official levels.
  let yoy: YearOverYear = null;
  if (latest) {
    const official = figures.find(
      (f) => f.measure === "growth_yoy" && f.is_current && sameScope(f, geography) && f.period_start === latest.period_start && f.period_end === latest.period_end,
    );
    if (official) {
      yoy = { kind: "official", change: Number(official.value), figure: official };
    } else {
      const start = shiftYear(latest.period_start, -1);
      const end = shiftYear(latest.period_end, -1);
      const previous = levels.find((f) => f.period_start === start && f.period_end === end);
      if (previous && Number(previous.value_base) !== 0) {
        yoy = { kind: "computed", change: ((Number(latest.value_base) - Number(previous.value_base)) / Number(previous.value_base)) * 100, previous };
      }
    }
  }

  // Sources behind the figures, strongest first, with their latest retrieval.
  const sources = new Map<string, { id: string; name_ar: string; name_en: string; tier: number; slug: string; fetchedAt: string | null; count: number }>();
  for (const f of figures) {
    if (!f.source) continue;
    const entry = sources.get(f.source.id) ?? { ...f.source, fetchedAt: null, count: 0 };
    entry.count += 1;
    const fetched = f.version?.fetched_at ?? null;
    if (fetched && (!entry.fetchedAt || fetched > entry.fetchedAt)) entry.fetchedAt = fetched;
    sources.set(f.source.id, entry);
  }

  return {
    geographies,
    geography,
    series: Object.fromEntries(granularities.map((g) => [g, series.get(g) ?? []])) as Partial<Record<Granularity, ChartPoint[]>>,
    granularities,
    defaultGranularity,
    latest,
    ytd,
    latestYear: latestYear && latestYear.id !== latest?.id ? latestYear : null,
    yoy,
    rows: figures.filter((f) => f.geography === geography).sort(byLatest),
    sources: [...sources.values()].sort((a, b) => a.tier - b.tier || b.count - a.count),
  };
}
