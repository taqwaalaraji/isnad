import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { SideCard, StatusPill, TierBadge, frequencyLabel, geoLabel } from "@/features/registry/components";
import { ExcerptView } from "@/features/registry/excerpt";
import { compactFigure, fullFigure, periodText } from "@/features/registry/format";
import { getDocument, isUuid } from "@/features/registry/queries";
import { ScrollToFocus } from "@/features/registry/scroll-to-focus";
import { requireNewsroom } from "@/lib/auth";
import { formatBytes, formatDate, formatRelative } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";

type Props = PageProps<"/[locale]/registry/documents/[id]">;

async function Content({ params, searchParams }: Props) {
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  if (!isUuid(id)) notFound();
  const figureParam = typeof query.figure === "string" && isUuid(query.figure) ? query.figure : undefined;
  const versionParam = typeof query.v === "string" && /^\d{1,4}$/.test(query.v) ? Number(query.v) : undefined;
  const data = await getDocument(id, { figureId: figureParam, version: versionParam });
  if (!data) notFound();
  const { document, versions, current, figures, focus, excerpt, fileUrl, downloadUrl } = data;
  const base = `/${locale}/registry`;
  const self = `${base}/documents/${document.id}`;
  const source = document.source;
  const location = (focus?.location ?? {}) as { page?: number; sheet?: string; cell?: string };
  const isCurrent = current?.id === document.current_version_id;
  const figureHref = (figureId: string) => `${self}?figure=${figureId}${current && !isCurrent ? `&v=${current.version}` : ""}`;
  const openHref = fileUrl && location.page && document.kind === "pdf" ? `${fileUrl}#page=${location.page}` : fileUrl;

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("registry.title"), href: base }, { label: document.title }]} />
      <PageHeader
        title={<span className="line-clamp-2">{document.title}</span>}
        badge={source ? <TierBadge tier={source.tier} t={t} /> : undefined}
        subtitle={[
          source?.entity ? (locale === "ar" ? source.entity.name_ar : source.entity.name_en) : source ? (locale === "ar" ? source.name_ar : source.name_en) : null,
          t(`registry.document.kind.${document.kind}` as MessageKey),
          current?.page_count ? t("registry.document.pages", { n: current.page_count }) : null,
          document.published_at ? t("registry.document.publishedOn", { date: formatDate(document.published_at, locale) }) : null,
          current ? t("registry.document.fetchedOn", { date: formatDate(current.fetched_at, locale) }) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {downloadUrl && (
              <ButtonLink href={downloadUrl} icon="download" prefetch={false}>
                {t("common.download")}
              </ButtonLink>
            )}
            {document.url && (
              <ButtonLink href={document.url} icon="external" target="_blank" rel="noopener noreferrer" prefetch={false}>
                {t("registry.document.original")}
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {focus && (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted">{focus.indicator ? (locale === "ar" ? focus.indicator.name_ar : focus.indicator.name_en) : t("registry.results.figures")}</p>
                  <p className="num mt-1 text-2xl font-semibold">{fullFigure(focus, locale)}</p>
                  <p className="mt-1 text-sm text-muted">
                    {[periodText(focus.period_start, focus.period_end, locale), geoLabel(focus.geography, t), focus.breakdown, focus.measure !== "level" ? t(`registry.measure.${focus.measure}` as MessageKey) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <StatusPill status={focus.status} t={t} />
              </div>
              <blockquote dir="auto" className="mt-4 rounded-sm border-s-4 border-accent bg-surface-sunken px-4 py-3 text-start text-[15px] leading-relaxed">
                «{focus.quote}»
              </blockquote>
              <p className="num mt-2 text-xs text-muted">
                {[
                  location.page ? t("check.page", { n: location.page }) : null,
                  location.sheet && location.cell ? t("registry.document.sheetCell", { sheet: location.sheet, cell: location.cell }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Card>
          )}

          <section className="overflow-hidden rounded-lg bg-surface-sunken">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-muted">
              <span>
                {excerpt?.kind === "page"
                  ? t("registry.document.pageOf", { page: excerpt.page, count: excerpt.page_count })
                  : excerpt?.kind === "sheet"
                    ? t("registry.document.sheetCell", { sheet: excerpt.sheet, cell: excerpt.focus })
                    : t("registry.document.excerptTitle")}
              </span>
              {openHref && (
                <a href={openHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                  <Icon name="external" size={14} />
                  {t("registry.document.openStored")}
                </a>
              )}
            </div>
            <ScrollToFocus deps={focus?.id ?? ""} className="max-h-[640px] overflow-auto px-4 pb-5 sm:px-8">
              {!current ? (
                <p className="py-16 text-center text-sm text-muted">{t("registry.document.noVersions")}</p>
              ) : excerpt && focus ? (
                <ExcerptView excerpt={excerpt} quote={focus.quote} value={focus.value} t={t} />
              ) : (
                <p className="py-16 text-center text-sm text-muted">{figures.length ? t("registry.document.noExcerpt") : t("registry.document.noFigures")}</p>
              )}
            </ScrollToFocus>
          </section>
        </div>

        <aside className="space-y-4">
          <SideCard title={t("registry.document.versions")} count={versions.length}>
            <ul className="space-y-2">
              {versions.map((v) => {
                const selected = v.id === current?.id;
                return (
                  <li key={v.id}>
                    <Link
                      href={v.id === document.current_version_id ? self : `${self}?v=${v.version}`}
                      aria-current={selected ? "page" : undefined}
                      className={cn("flex gap-3 rounded-md p-3 transition-colors", selected ? "bg-accent-soft" : "bg-surface-sunken/60 hover:bg-surface-sunken")}
                    >
                      <span className={cn("num text-sm font-semibold", selected ? "text-accent" : "text-muted")}>v{v.version}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {formatDate(v.fetched_at, locale)}
                          {v.id === document.current_version_id && ` · ${t("registry.document.current")}`}
                        </span>
                        <span className="num block text-xs text-muted">
                          {t("registry.document.versionMeta", { figures: v.figures_count, size: formatBytes(v.size_bytes, locale) })}
                          {" · "}
                          {t(`registry.document.fetchedVia.${v.fetched_via}` as MessageKey)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SideCard>

          <SideCard title={t("registry.document.extracted")} count={figures.length}>
            {figures.length === 0 ? (
              <p className="text-sm text-muted">{t("registry.document.noFigures")}</p>
            ) : (
              <ul className="-mx-2 max-h-[420px] overflow-y-auto">
                {figures.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={figureHref(f.id)}
                      scroll={false}
                      aria-current={f.id === focus?.id ? "true" : undefined}
                      className={cn("flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors", f.id === focus?.id ? "bg-accent-soft" : "hover:bg-surface-sunken")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{f.indicator ? (locale === "ar" ? f.indicator.name_ar : f.indicator.name_en) : f.quote}</span>
                        <span className="block truncate text-xs text-muted">
                          {[periodText(f.period_start, f.period_end, locale), geoLabel(f.geography, t), f.breakdown].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="num shrink-0 font-semibold">{compactFigure(f, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>

          {source && (
            <SideCard title={t("registry.document.fetch")} className="bg-surface-sunken/60">
              <p className="text-xs text-muted">
                {t("registry.document.fetchMeta", {
                  when: source.last_fetched_at ? formatRelative(source.last_fetched_at, locale) : t("registry.never"),
                  frequency: frequencyLabel(source.update_frequency, t) ?? "—",
                })}
              </p>
              {current && (
                <>
                  <p className="mt-2 text-xs text-muted">{t(`registry.document.extraction.${current.extraction_status}` as MessageKey)}</p>
                  <p className="num mt-1 truncate text-[11px] text-subtle" dir="ltr" title={current.content_hash}>
                    sha256 {current.content_hash.slice(0, 12)}
                  </p>
                </>
              )}
            </SideCard>
          )}
        </aside>
      </div>
    </>
  );
}

export default function DocumentPage(props: Props) {
  return (
    <Suspense fallback={<DocumentSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}

function DocumentSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full max-w-96" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[560px] rounded-lg" />
        <Skeleton className="h-[560px] rounded-lg" />
      </div>
    </div>
  );
}
