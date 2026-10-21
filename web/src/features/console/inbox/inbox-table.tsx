import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { formatBytes, formatRelative } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translate";

import { inboxState, InboxStateBadge } from "../badges";
import type { InboxRow } from "../queries";
import { RetryExtraction } from "./retry-extraction";

function progressText(row: InboxRow, t: Translate): string {
  if (row.extraction_status === "failed") return row.extraction_error ? row.extraction_error.slice(0, 120) : t("console.inbox.statuses.failed");
  if (row.extraction_status === "pending" || row.extraction_status === "extracting") return t(`console.inbox.statuses.${row.extraction_status}`);
  if (row.extraction_status === "unchanged") return t("console.inbox.statuses.unchanged");
  if (!row.figures_count) return t("console.inbox.noFigures");
  return row.pendingFigures ? t("console.inbox.statuses.extracted", { n: row.pendingFigures }) : t("console.inbox.reviewedCount", { n: row.figures_count });
}

export function InboxTable({ rows, t, locale }: { rows: InboxRow[]; t: Translate; locale: Locale }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-sunken/50 text-xs text-muted">
            <th className="px-5 py-3 text-start font-medium">{t("console.inbox.file")}</th>
            <th className="px-3 py-3 text-start font-medium">{t("console.inbox.source")}</th>
            <th className="w-56 px-3 py-3 text-start font-medium">{t("console.sources.figures")}</th>
            <th className="px-3 py-3 text-start font-medium">{t("console.sources.health")}</th>
            <th className="px-5 py-3 text-end font-medium">{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const state = inboxState(row.extraction_status, row.pendingFigures);
            const doc = row.document;
            const source = doc?.source;
            const reviewed = row.figures_count ? (row.figures_count - row.pendingFigures) / row.figures_count : 0;
            return (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-sunken/60">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-muted">
                      <Icon name={doc?.kind === "xlsx" || doc?.kind === "csv" ? "table" : "file"} size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="max-w-[340px] truncate font-semibold" dir="auto">
                        {doc?.title}
                      </p>
                      <p className="num truncate text-xs text-muted">
                        {[
                          formatBytes(row.size_bytes, locale),
                          t(`registry.document.fetchedVia.${row.fetched_via}`),
                          row.fetcher?.full_name,
                          formatRelative(row.fetched_at, locale),
                          row.version > 1 ? t("console.sources.detail.version", { n: row.version }) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted">
                  {source ? (
                    <Link href={`/${locale}/console/sources/${source.id}`} className="hover:text-accent">
                      {locale === "ar" ? source.name_ar : source.name_en}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-3">
                  <p className={row.extraction_status === "failed" ? "truncate text-xs text-differ-text" : "text-xs text-muted"} title={row.extraction_error ?? undefined}>
                    {progressText(row, t)}
                  </p>
                  {row.extraction_status === "extracted" && row.figures_count > 0 && (
                    <ProgressBar value={reviewed * 100} label={t("console.review.title")} className="mt-1.5" />
                  )}
                </td>
                <td className="px-3 py-3">
                  <InboxStateBadge state={state} t={t} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {state === "review" && (
                      <Link
                        href={`/${locale}/console/review?version=${row.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-on-accent hover:bg-accent-hover"
                      >
                        <Icon name="review" size={14} />
                        {t("console.inbox.review")}
                      </Link>
                    )}
                    {/* Re-extraction costs a model run: offered for failures and files that yielded nothing. */}
                    {(row.extraction_status === "failed" || (row.extraction_status === "extracted" && !row.figures_count)) && (
                      <RetryExtraction versionId={row.id} quiet={row.extraction_status !== "failed"} />
                    )}
                    {doc?.url && (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" aria-label={t("console.review.openOriginal")} className="rounded-sm p-1.5 text-muted hover:bg-surface-sunken hover:text-text">
                        <Icon name="external" size={16} />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
