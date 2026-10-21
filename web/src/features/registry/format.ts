import { formatFigure, formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";

import type { FigureValue } from "./types";

const SHORT: Array<[number, string]> = [
  [1e12, "tn"],
  [1e9, "bn"],
  [1e6, "M"],
  [1e3, "K"],
];
const MULTIPLIER: Record<string, number> = { one: 1, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
/** Spreadsheet cells can carry float noise (12.449863064); never show more than this. */
const MAX_DECIMALS = 3;

/**
 * Dense form for cards and tables: "5.1M", "34.2bn", "12.45%". Always scaled from the base value,
 * so 91,438.3 million reads as "91.4bn" and 4,135,985 as "4.14M".
 */
export function compactFigure(figure: FigureValue, locale: Locale): string {
  const value = Number(figure.value);
  if (!Number.isFinite(value)) return String(figure.value);
  if (figure.unit === "%") return `${formatNumber(Number(value.toFixed(2)), locale)}%`;
  const base = value * (MULTIPLIER[figure.scale] ?? 1);
  const [divisor, suffix] = SHORT.find(([d]) => Math.abs(base) >= d * 0.9995) ?? [1, ""];
  const scaled = base / divisor;
  const decimals = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  return `${formatNumber(Number(scaled.toFixed(decimals)), locale)}${suffix}`;
}

/**
 * Two published values differ only if they differ beyond the rounding of the less precise one
 * (3.8% and 3.820%, or 1.2 trillion and 1,178,445 million, are the same number).
 */
export function differsBeyondRounding(a: FigureValue, b: FigureValue): boolean {
  const base = (f: FigureValue) => Number(f.value) * (f.unit === "%" ? 1 : (MULTIPLIER[f.scale] ?? 1));
  const half = (f: FigureValue) => 0.5 * 10 ** -Math.min(f.decimals ?? 0, 6) * (f.unit === "%" ? 1 : (MULTIPLIER[f.scale] ?? 1));
  return Math.abs(base(a) - base(b)) > Math.max(half(a), half(b)) + 1e-9;
}

/** Full form with scale and unit words: "19.59 مليون زائر". */
export function fullFigure(figure: FigureValue, locale: Locale): string {
  const unit = locale === "en" ? englishPlural(figure.unit, Number(figure.value), figure.scale) : figure.unit;
  return formatFigure({ ...figure, unit, decimals: Math.min(figure.decimals ?? 0, MAX_DECIMALS) }, locale);
}

const IRREGULAR: Record<string, string> = { person: "people", child: "children" };

/** "visitor" → "visitors" for counts other than exactly one (codes like AED and % stay as they are). */
function englishPlural(unit: string, value: number, scale: string): string {
  if (!unit || unit === "%" || unit === "index" || /^[A-Z]{3}$/.test(unit) || unit.includes(" ")) return unit;
  if (value === 1 && scale === "one") return unit;
  if (IRREGULAR[unit]) return IRREGULAR[unit];
  if (/(s|x|ch|sh)$/.test(unit)) return `${unit}es`;
  if (/[^aeiou]y$/.test(unit)) return `${unit.slice(0, -1)}ies`;
  return `${unit}s`;
}

const MONTHS: Record<Locale, string[]> = {
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const MONTHS_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUARTERS_AR = ["الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"];
const HALVES_AR = ["النصف الأول", "النصف الثاني"];

function parse(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export type Granularity = "year" | "half" | "quarter" | "month" | "range";

/** What kind of period a figure covers (a calendar year, half, quarter, month, or another range). */
export function granularity(start: string, end: string): Granularity {
  const a = parse(start);
  const b = parse(end);
  if (a.d !== 1 || b.d !== lastDayOfMonth(b.y, b.m)) return "range";
  const months = (b.y - a.y) * 12 + b.m - a.m + 1;
  if (a.y !== b.y) return "range";
  if (months === 12) return "year";
  if (months === 6 && (a.m === 1 || a.m === 7)) return "half";
  if (months === 3 && [1, 4, 7, 10].includes(a.m)) return "quarter";
  if (months === 1) return "month";
  return "range";
}

/** A readable period label (mirrors the worker's `period_label`). */
export function periodText(start: string, end: string, locale: Locale, short = false): string {
  const a = parse(start);
  const b = parse(end);
  const kind = granularity(start, end);
  const ar = locale === "ar";
  const months = short && !ar ? MONTHS_SHORT_EN : MONTHS[locale];
  switch (kind) {
    case "year":
      return String(a.y);
    case "half":
      return ar ? `${HALVES_AR[a.m === 1 ? 0 : 1]} ${a.y}` : `H${a.m === 1 ? 1 : 2} ${a.y}`;
    case "quarter":
      return ar ? `${QUARTERS_AR[(a.m - 1) / 3]} ${a.y}` : `Q${(a.m - 1) / 3 + 1} ${a.y}`;
    case "month":
      return `${months[a.m - 1]} ${a.y}`;
    default:
      if (a.d === 1 && b.d === lastDayOfMonth(b.y, b.m)) {
        return a.y === b.y ? `${months[a.m - 1]}–${months[b.m - 1]} ${a.y}` : `${months[a.m - 1]} ${a.y} – ${months[b.m - 1]} ${b.y}`;
      }
      return `${start.slice(0, 10)} – ${end.slice(0, 10)}`;
  }
}

/** Short axis label for a chart point ("Q3 2025", "2024", "Sep 2025"). */
export function axisLabel(start: string, end: string, locale: Locale): string {
  const kind = granularity(start, end);
  const a = parse(start);
  if (kind === "quarter") return locale === "ar" ? `ر${(a.m - 1) / 3 + 1} ${a.y}` : `Q${(a.m - 1) / 3 + 1} ${a.y}`;
  if (kind === "half") return locale === "ar" ? `ن${a.m === 1 ? 1 : 2} ${a.y}` : `H${a.m === 1 ? 1 : 2} ${a.y}`;
  if (kind === "month") return `${(locale === "ar" ? MONTHS.ar : MONTHS_SHORT_EN)[a.m - 1]} ${String(a.y).slice(2)}`;
  return periodText(start, end, locale, true);
}

/** Signed percent change, e.g. "+13%" (rounded to the nearest whole percent, or one decimal under 10%). */
export function signedPercent(change: number, locale: Locale): string {
  const digits = Math.abs(change) < 10 ? 1 : 0;
  const text = formatNumber(Math.abs(change), locale, digits);
  return `${change > 0 ? "+" : change < 0 ? "−" : ""}${text}%`;
}
