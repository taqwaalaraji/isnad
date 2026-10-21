import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { Nuqta } from "@/components/ui/nuqta";
import { VerdictBadge } from "@/features/checks/badges";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translate";

import type { BriefDetail } from "./queries";
import type { BriefFigure } from "./types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-5 break-inside-avoid-page print:border-ink/20">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
        <Nuqta size={7} />
        {title}
      </h2>
      {children}
    </section>
  );
}

function evidenceHref(figure: BriefFigure, locale: Locale): string | null {
  return figure.document_id ? `/${locale}/registry/documents/${figure.document_id}?figure=${figure.id}` : null;
}

/** The brief as a reader sees it, on screen and on paper. Every number links to its evidence. */
export function BriefSheet({
  brief,
  locale,
  t,
  newsroomName,
}: {
  brief: BriefDetail;
  locale: Locale;
  t: Translate;
  newsroomName: string;
}) {
  const content = brief.content;
  const figures = content.figures ?? [];
  const byId = new Map(figures.map((f) => [f.id, f]));
  const highlights = (content.highlights ?? []).filter((h) => byId.has(h.figure_id));
  const shown = highlights.length ? highlights.map((h) => ({ figure: byId.get(h.figure_id)!, note: h.note })) : figures.slice(0, 8).map((f) => ({ figure: f, note: null }));
  const sources = new Set(figures.map((f) => f.source)).size;
  const months = content.options?.period_months ?? 12;
  const entity = brief.entity ? (locale === "ar" ? brief.entity.name_ar : brief.entity.name_en) : "";
  const topic = brief.topic ? (locale === "ar" ? brief.topic.name_ar : brief.topic.name_en) : null;

  return (
    <article className="rounded-lg border border-border bg-surface p-6 shadow-card sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-4">
        <span className="shrink-0">
          <Image src="/brand/isnad-logo-arabic-color.svg" alt={t("common.appName")} width={96} height={30} className="h-7 w-auto dark:hidden print:block" />
          <Image src="/brand/isnad-logo-arabic-reversed.svg" alt="" width={96} height={30} className="hidden h-7 w-auto dark:block print:hidden" />
        </span>
        <p className="text-end text-xs text-muted">
          {t("briefs.preparedFor", { newsroom: newsroomName })}
          <br />
          {t("briefs.editorialUse")}
        </p>
      </header>

      <h1 className="mt-6 text-2xl leading-snug font-bold">{t("briefs.sheetTitle")}</h1>
      <p className="mt-1 text-sm text-muted">
        {[entity, topic, t("briefs.lastMonths", { n: months }), t("briefs.sourcesCount", { n: sources })].filter(Boolean).join(" · ")}
      </p>
      {(brief.guest_name || brief.interview_date) && (
        <p className="mt-1 text-sm">
          {[brief.guest_name, brief.interview_date && formatDate(brief.interview_date, locale, "long")].filter(Boolean).join(" · ")}
        </p>
      )}

      {content.summary && <p className="mt-5 rounded-md bg-surface-sunken p-4 text-[15px] leading-relaxed">{content.summary}</p>}

      <div className="mt-6 space-y-6">
        <Section title={t("briefs.keyFigures")}>
          {shown.length === 0 ? (
            <p className="text-sm text-muted">{t("briefs.noFigures")}</p>
          ) : (
            <ul className="space-y-4">
              {shown.map(({ figure, note }) => {
                const href = evidenceHref(figure, locale);
                return (
                  <li key={figure.id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="num rounded-sm bg-highlight px-1.5 py-0.5 font-semibold">{figure.value}</span>
                        {figure.revised && (
                          <span className="rounded-full border border-context px-2 text-[11px] text-context-text">{t("briefs.revisedBadge")}</span>
                        )}
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {figure.indicator} · {figure.period}
                        {figure.breakdown ? ` · ${figure.breakdown}` : ""}
                      </p>
                      {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
                    </div>
                    <div className="shrink-0 text-xs text-muted sm:max-w-[40%] sm:text-end">
                      <p className="line-clamp-2">
                        {figure.source} · {figure.document}
                      </p>
                      {href && (
                        <Link href={href} className="mt-0.5 inline-flex items-center gap-1 text-accent hover:underline print:text-ink">
                          <Icon name="external" size={12} className="print:hidden" />
                          {t("briefs.evidence")}
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {(content.revisions?.length ?? 0) > 0 && (
          <Section title={t("briefs.revisions")}>
            <ul className="space-y-3">
              {content.revisions!.map((r) => (
                <li key={r.figure_id} className="border-s-2 border-context ps-3 text-sm">
                  <p className="font-medium">
                    {r.indicator} · {r.period}
                  </p>
                  <p className="num mt-0.5 text-muted">
                    <span className="line-through">{r.previous_value}</span> ← <span className="font-semibold text-text">{r.value}</span>
                    {r.revised_at && <span className="ms-2 text-xs">{formatDate(r.revised_at, locale)}</span>}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(content.statements?.length ?? 0) > 0 && (
          <Section title={t("briefs.statements")}>
            <ul className="space-y-3">
              {content.statements!.map((s) => (
                <li key={s.claim_id} className="rounded-md border-s-4 border-accent bg-surface-sunken/60 px-4 py-3">
                  <p className="text-[15px] leading-relaxed">«{s.span}»</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {s.verdict && <VerdictBadge verdict={s.verdict} t={t} size="sm" short />}
                    <Link href={`/${locale}/checks/${s.check_id}?claim=${s.claim_id}`} className="hover:underline">
                      {s.check_title}
                    </Link>
                    {s.date && <span>· {formatDate(s.date, locale)}</span>}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(content.questions?.length ?? 0) > 0 && (
          <Section title={t("briefs.questions")}>
            <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed marker:text-muted">
              {content.questions!.map((q, i) => (
                <li key={i}>{q.question}</li>
              ))}
            </ol>
          </Section>
        )}

        {figures.length > shown.length && (
          <Section title={t("briefs.allFigures", { n: figures.length })}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-1.5 text-start font-medium">{t("fields.indicator")}</th>
                  <th className="py-1.5 text-start font-medium">{t("fields.period")}</th>
                  <th className="py-1.5 text-start font-medium">{t("fields.value")}</th>
                  <th className="py-1.5 text-start font-medium print:hidden">{t("briefs.evidence")}</th>
                </tr>
              </thead>
              <tbody>
                {figures.map((f) => {
                  const href = evidenceHref(f, locale);
                  return (
                    <tr key={f.id} className={cn("border-t border-border")}>
                      <td className="py-2 pe-3">
                        {f.indicator}
                        {f.breakdown && <span className="text-muted"> · {f.breakdown}</span>}
                      </td>
                      <td className="py-2 pe-3 text-muted">{f.period}</td>
                      <td className="num py-2 pe-3 font-medium">{f.value}</td>
                      <td className="py-2 print:hidden">
                        {href && (
                          <Link href={href} className="text-xs text-accent hover:underline">
                            {f.source}
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        )}
      </div>

      <footer className="mt-8 border-t border-border pt-4 text-xs text-muted">
        {t("briefs.preparedBy", { name: brief.author?.full_name ?? "—", date: formatDate(brief.updated_at, locale, "datetime") })} · {t("briefs.onlyRegistry")}
      </footer>
    </article>
  );
}
