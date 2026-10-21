import Link from "next/link";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { CheckTable } from "@/features/checks/check-table";
import { listChecks } from "@/features/checks/queries";
import { IndicatorRow, SideCard, TierBadge, TopicTile, UpdatedAt, frequencyLabel, geoLabel } from "@/features/registry/components";
import { compactFigure, periodText } from "@/features/registry/format";
import { latestByIndicator, latestFigures, registryStats, searchRegistry, topicStats } from "@/features/registry/queries";
import { ModeTabs, SearchBox } from "@/features/registry/search-box";
import { type Membership, requireNewsroom, type Viewer } from "@/lib/auth";
import { formatDate, formatNumber } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";

type Props = PageProps<"/[locale]/registry">;

async function Content({ params, searchParams }: Props) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [viewer, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";
  const base = `/${locale}/registry`;
  const [stats, topics, latest] = await Promise.all([registryStats(), topicStats(), latestFigures(6)]);
  const suggestions = [...new Set(latest.map((f) => (locale === "ar" ? f.indicator?.name_ar : f.indicator?.name_en)).filter(Boolean))].slice(0, 5) as string[];

  return (
    <>
      <SetBreadcrumbs items={q ? [{ label: t("registry.title"), href: base }, { label: q }] : [{ label: t("registry.title") }]} />
      <PageHeader
        title={t("registry.title")}
        subtitle={t("registry.subtitle", { figures: formatNumber(stats.figures, locale), sources: formatNumber(stats.sources, locale) })}
        actions={
          <ButtonLink href={`${base}/coverage`} icon="grid">
            {t("registry.coverage")}
          </ButtonLink>
        }
      />

      <Card className="mb-6 space-y-4 p-5 md:p-6">
        <ModeTabs mode="search" />
        <SearchBox key={q} initial={q} />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{t("registry.popular")}</span>
            {suggestions.map((s) => (
              <Link
                key={s}
                href={`${base}?q=${encodeURIComponent(s)}`}
                className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-text transition-colors hover:border-border-strong hover:bg-surface-sunken"
              >
                {s}
              </Link>
            ))}
          </div>
        )}
      </Card>

      {q ? (
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
          <CheckMatches q={q} viewer={viewer} locale={locale} t={t} />
          <Results q={q} locale={locale} t={t} />
        </Suspense>
      ) : stats.figures === 0 && latest.length === 0 ? (
        <Card>
          <EmptyState icon={<Icon name="registry" size={32} />} title={t("registry.emptyTitle")} body={t("registry.emptyBody")} />
        </Card>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("registry.topics")}</h2>
            <Link href={`${base}/coverage`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              <Icon name="external" size={14} />
              {t("registry.allTopics")}
            </Link>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
            {[...topics]
              .sort((a, b) => b.figures - a.figures || a.sort_order - b.sort_order)
              .slice(0, 6)
              .map((topic) => (
                <Link
                  key={topic.id}
                  href={`${base}/topics/${topic.slug}`}
                  className="group rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-border-strong"
                >
                  <div className="flex items-start justify-between">
                    <TopicTile icon={topic.icon} />
                    <Icon name="arrow-left" size={16} className="text-subtle transition-transform group-hover:-translate-x-0.5 ltr:rotate-180 ltr:group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-3 font-semibold">{locale === "ar" ? topic.name_ar : topic.name_en}</p>
                  <p className="num mt-0.5 text-xs text-muted">
                    {t("registry.indicatorsCount", { n: topic.indicators })} · {t("registry.sourcesCount", { n: topic.sources })}
                  </p>
                  <p className="mt-2 text-xs text-subtle">
                    <UpdatedAt value={topic.last_updated_at} locale={locale} t={t} />
                  </p>
                </Link>
              ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <h2 className="text-[15px] font-semibold">{t("registry.latestFigures")}</h2>
              </div>
              {latest.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted">{t("registry.noFiguresYet")}</p>
              ) : (
                <ul>
                  {latest.map((f) => (
                    <IndicatorRow
                      key={f.id}
                      href={`${base}/indicators/${f.indicator?.slug}`}
                      name={(locale === "ar" ? f.indicator?.name_ar : f.indicator?.name_en) ?? ""}
                      meta={[
                        locale === "ar" ? (f.entity?.short_name_ar ?? f.entity?.name_ar ?? f.source?.name_ar) : (f.entity?.short_name_en ?? f.entity?.name_en ?? f.source?.name_en),
                        geoLabel(f.geography, t),
                        f.measure !== "level" ? t(`registry.measure.${f.measure as "level"}`) : frequencyLabel(f.indicator?.frequency, t),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      figure={f}
                      series={f.series}
                      tier={f.source?.tier ?? null}
                      locale={locale}
                      t={t}
                    />
                  ))}
                </ul>
              )}
            </Card>
            <SideCard
              title={t("registry.freshness")}
              action={
                <Link href={`${base}/coverage`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  <Icon name="external" size={14} />
                  {t("registry.coverage")}
                </Link>
              }
            >
              <ul className="space-y-4">
                {[...topics]
                  .filter((tp) => tp.sources > 0)
                  .sort((a, b) => (b.last_updated_at ?? "").localeCompare(a.last_updated_at ?? ""))
                  .slice(0, 5)
                  .map((topic) => (
                    <li key={topic.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{locale === "ar" ? topic.name_ar : topic.name_en}</span>
                        <span className="text-xs text-muted">
                          <UpdatedAt value={topic.last_updated_at} locale={locale} t={t} />
                        </span>
                      </div>
                      <ProgressBar value={(topic.fresh_sources / Math.max(1, topic.sources)) * 100} label={t("registry.freshnessHint")} />
                    </li>
                  ))}
              </ul>
              <p className="mt-4 text-xs text-subtle">{t("registry.freshnessHint")}</p>
            </SideCard>
          </div>
        </>
      )}
    </>
  );
}

/** The top-bar search covers the newsroom's own checks too; they come first when the title matches. */
async function CheckMatches({ q, viewer, locale, t }: { q: string; viewer: Viewer & { active: Membership }; locale: Locale; t: Translate }) {
  const { rows, total } = await listChecks(viewer, { filter: "all", q, page: 1 });
  if (total === 0) return null;
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader
        title={
          <>
            {t("registry.results.checks")} <span className="num text-sm font-normal text-muted">({total})</span>
          </>
        }
        action={
          <Link href={`/${locale}/checks?q=${encodeURIComponent(q)}`} className="text-xs font-medium text-accent hover:underline">
            {t("common.viewAll")}
          </Link>
        }
      />
      <CheckTable rows={rows.slice(0, 5)} t={t} locale={locale} />
    </Card>
  );
}

async function Results({ q, locale, t }: { q: string; locale: Locale; t: Translate }) {
  const results = await searchRegistry(q);
  const latest = await latestByIndicator(results.indicators.map((i) => i.id));
  const base = `/${locale}/registry`;
  const empty = !results.indicators.length && !results.entities.length && !results.documents.length && !results.figures.length;
  if (empty) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="search" size={32} />}
          title={t("registry.noResults", { q })}
          body={t("registry.noResultsHint")}
          action={
            <ButtonLink href={`${base}/ask?q=${encodeURIComponent(q)}`} icon="sparkles">
              {t("registry.ask.tryAsk")}
            </ButtonLink>
          }
        />
      </Card>
    );
  }
  const name = (row: { name_ar: string; name_en: string }) => (locale === "ar" ? row.name_ar : row.name_en);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {results.indicators.length > 0 && (
          <Card className="overflow-hidden">
            <h2 className="px-5 pt-4 pb-3 text-[15px] font-semibold">
              {t("registry.results.indicators")} <span className="num text-sm font-normal text-muted">({results.indicators.length})</span>
            </h2>
            <ul>
              {results.indicators.map((i) => {
                const figure = latest.get(i.id) ?? null;
                return (
                  <IndicatorRow
                    key={i.id}
                    href={`${base}/indicators/${i.slug}`}
                    name={name(i)}
                    meta={[locale === "ar" ? i.topic_ar : i.topic_en, frequencyLabel(i.frequency, t)].filter(Boolean).join(" · ")}
                    figure={figure}
                    series={[]}
                    tier={figure?.source?.tier ?? null}
                    locale={locale}
                    t={t}
                  />
                );
              })}
            </ul>
          </Card>
        )}
        {results.figures.length > 0 && (
          <Card className="overflow-hidden">
            <h2 className="px-5 pt-4 pb-3 text-[15px] font-semibold">
              {t("registry.results.figures")} <span className="num text-sm font-normal text-muted">({results.figures.length})</span>
            </h2>
            <ul>
              {results.figures.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`${base}/documents/${f.document_id}?figure=${f.id}`}
                    className="flex items-center gap-4 border-t border-border px-5 py-3 transition-colors first:border-t-0 hover:bg-surface-sunken/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {locale === "ar" ? f.indicator_ar : f.indicator_en}
                        {f.measure !== "level" && <span className="text-muted"> · {t(`registry.measure.${f.measure as "level"}`)}</span>}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[locale === "ar" ? f.source_ar : f.source_en, geoLabel(f.geography, t), periodText(f.period_start, f.period_end, locale)].join(" · ")}
                      </p>
                    </div>
                    <TierBadge tier={f.tier} t={t} short />
                    <span className="num w-24 shrink-0 text-end font-semibold">{compactFigure(f, locale)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <div className="space-y-6">
        {results.entities.length > 0 && (
          <SideCard title={t("registry.results.entities")} count={results.entities.length}>
            <ul className="space-y-1">
              {results.entities.map((e) => (
                <li key={e.id}>
                  <Link href={`${base}/entities/${e.slug}`} className="-mx-2 flex items-center gap-2 rounded-md px-2 py-2 hover:bg-surface-sunken">
                    <Icon name="building" size={16} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{name(e)}</span>
                      <span className="block text-xs text-muted">{t(`registry.entity.kind.${e.kind as "other"}`)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </SideCard>
        )}
        {results.documents.length > 0 && (
          <SideCard title={t("registry.results.documents")} count={results.documents.length}>
            <ul className="space-y-1">
              {results.documents.map((d) => (
                <li key={d.id}>
                  <Link href={`${base}/documents/${d.id}`} className="-mx-2 flex items-start gap-2 rounded-md px-2 py-2 hover:bg-surface-sunken">
                    <Icon name={d.kind === "xlsx" || d.kind === "csv" ? "table" : "file"} size={16} className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium">{d.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {[locale === "ar" ? d.source_ar : d.source_en, d.published_at ? formatDate(d.published_at, locale) : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </SideCard>
        )}
      </div>
    </div>
  );
}

export default function RegistryPage(props: Props) {
  return (
    <Suspense fallback={<RegistrySkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}

function RegistrySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-full max-w-56" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}
