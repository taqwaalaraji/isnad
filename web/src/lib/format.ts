import { intlLocale, type Locale } from "@/lib/i18n/config";

const SCALE_WORDS: Record<Locale, Record<string, string>> = {
  ar: { thousand: "ألف", million: "مليون", billion: "مليار", trillion: "تريليون" },
  en: { thousand: "thousand", million: "million", billion: "billion", trillion: "trillion" },
};
const SCALE_SHORT: Record<string, string> = { thousand: "K", million: "M", billion: "bn", trillion: "tn" };

export function formatNumber(value: number | string | null | undefined, locale: Locale, decimals?: number): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
  }).format(n);
}

/** A figure as published: "5.0 مليون", "12.1%", "34.2 مليار درهم". */
export function formatFigure(
  figure: { value: number | string; scale?: string | null; decimals?: number | null; unit?: string | null },
  locale: Locale,
  { withUnit = true }: { withUnit?: boolean } = {},
): string {
  const number = formatNumber(figure.value, locale, figure.decimals ?? undefined);
  const unit = figure.unit ?? "";
  if (unit === "%") return `${number}%`;
  const scale = figure.scale && figure.scale !== "one" ? SCALE_WORDS[locale][figure.scale] : "";
  return [number, scale, withUnit ? localizeUnit(unit, locale) : ""].filter(Boolean).join(" ");
}

/** Compact form for dense tables: "5.1M", "34.2bn", "12.1%". */
export function formatCompact(
  figure: { value: number | string; scale?: string | null; decimals?: number | null; unit?: string | null },
  locale: Locale,
): string {
  const number = formatNumber(figure.value, locale, figure.decimals ?? undefined);
  if (figure.unit === "%") return `${number}%`;
  const suffix = figure.scale && figure.scale !== "one" ? SCALE_SHORT[figure.scale] : "";
  return `${number}${suffix}`;
}

const UNIT_AR: Record<string, string> = {
  AED: "درهم",
  USD: "دولار",
  visitor: "زائر",
  guest: "نزيل",
  person: "نسمة",
  night: "ليلة",
  room: "غرفة",
  passenger: "مسافر",
  worker: "عامل",
  student: "طالب",
  company: "شركة",
  vehicle: "مركبة",
  transaction: "صفقة",
  "barrels per day": "برميل يومياً",
  years: "سنة",
};

export function localizeUnit(unit: string, locale: Locale): string {
  if (!unit || unit === "index") return "";
  return locale === "ar" ? (UNIT_AR[unit] ?? unit) : unit;
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: Locale,
  style: "short" | "medium" | "long" | "time" | "datetime" = "medium",
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : value;
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short" }
      : style === "long"
        ? { day: "numeric", month: "long", year: "numeric" }
        : style === "time"
          ? { hour: "2-digit", minute: "2-digit" }
          : style === "datetime"
            ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
            : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Asia/Dubai", ...options }).format(date);
}

/** "قبل 5 دقائق" / "5 min ago", falling back to a date after a week. */
export function formatRelative(value: string | Date | null | undefined, locale: Locale, now = new Date()): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), "day");
  return formatDate(date, locale, "medium");
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatBytes(bytes: number, locale: Locale): string {
  const units = locale === "ar" ? ["بايت", "ك.ب", "م.ب", "ج.ب"] : ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${formatNumber(value, locale, i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatCost(usd: number | string | null | undefined, locale: Locale): string {
  const n = Number(usd ?? 0);
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 3 : 2 }).format(n);
}
