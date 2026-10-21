import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translate";
import type { Evidence } from "@/lib/types";

import type { CheckDetail } from "../queries";
import { evidencePeriod, evidencePublisher } from "./labels";
import type { WorkspaceSegment } from "./types";

function srtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = Math.floor(ms % 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`;
}

/** Subtitles from the transcript, in SubRip format. */
export function toSrt(segments: WorkspaceSegment[]): string {
  return segments
    .filter((s) => s.start_ms !== null)
    .map((s, i) => `${i + 1}\n${srtTime(s.start_ms!)} --> ${srtTime(Math.max(s.end_ms ?? s.start_ms!, s.start_ms! + 500))}\n${s.text}\n`)
    .join("\n");
}

/**
 * The isnad note: each approved number with the official document behind it, ready to paste under a story.
 * Only approved or edited numbers with evidence are included.
 */
export function isnadNote(detail: CheckDetail, locale: Locale, publicUrl: string | null, t: Translate): string {
  const lines: string[] = [];
  for (const claim of detail.claims) {
    const result = claim.result;
    const evidence = result?.evidence as Evidence | null | undefined;
    if (!result || !evidence || evidence.closest) continue;
    if (claim.review_state !== "approved" && claim.review_state !== "edited") continue;
    const source = evidencePublisher(evidence, locale);
    const period = evidencePeriod(evidence, locale);
    const wording = claim.review_state === "edited" && result.suggested_wording ? result.suggested_wording : claim.span_text;
    const date = evidence.document.fetched_at ? formatDate(evidence.document.fetched_at, locale) : null;
    lines.push(
      [`• «${wording}»`, `  ${t("publicNote.source")}: ${source} — ${evidence.document.title}${period ? ` (${period})` : ""}`, evidence.document.url ? `  ${evidence.document.url}` : null, date ? `  ${t("check.retrievedAt", { date })}` : null]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (lines.length === 0) return "";
  const header = t("check.noteHeading");
  const footer = [publicUrl ? `${t("check.publicPage")}: ${publicUrl}` : null, detail.check.newsroom?.brand_isnad_note ? t("check.noteBrand") : null]
    .filter(Boolean)
    .join("\n");
  return [header, "", lines.join("\n\n"), footer ? `\n${footer}` : ""].join("\n").trim();
}
