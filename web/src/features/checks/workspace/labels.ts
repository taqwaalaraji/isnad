import { periodText } from "@/features/registry/format";
import type { Locale } from "@/lib/i18n/config";
import type { Evidence } from "@/lib/types";

/** Locale-aware labels for stored evidence (older results lack the localized fields). */
export function evidencePublisher(evidence: Evidence, locale: string): string {
  return locale === "ar" ? (evidence.publisher_name_ar ?? evidence.source_name_ar) : (evidence.publisher_name_en ?? evidence.source_name_en);
}

export function evidencePeriod(evidence: Evidence, locale: Locale): string {
  const localized = locale === "ar" ? evidence.period_label_ar : evidence.period_label_en;
  if (localized) return localized;
  return evidence.period_start && evidence.period_end ? periodText(evidence.period_start, evidence.period_end, locale) : evidence.period_label;
}

export function evidenceValue(evidence: Evidence, locale: string): string {
  return (locale === "en" && evidence.value_text_en) || evidence.value_text;
}
