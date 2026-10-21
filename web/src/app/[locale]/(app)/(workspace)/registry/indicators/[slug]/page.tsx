import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, Metric, PageHeader, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { Pagination } from "@/components/ui/pagination";
import { VerdictCounts } from "@/features/checks/badges";
import { SideCard, StatusPill, TierBadge, frequencyLabel, geoLabel } from "@/features/registry/components";
import { FollowButton } from "@/features/registry/follow-button";
import { compactFigure, fullFigure, periodText, signedPercent } from "@/features/registry/format";
import { buildIndicatorView, revisedFrom } from "@/features/registry/indicator";
import { IndicatorChart } from "@/features/registry/indicator-chart";
import { getIndicator } from "@/features/registry/queries";
import { requireNewsroom } from "@/lib/auth";
import { formatDate, formatRelative, localizeUnit } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";

type Props = PageProps<"/[locale]/registry/indicators/[slug]">;
const PAGE_SIZE = 12;

async function Content({ params, searchParams }: Props) {
  const [{ locale: raw, slug }, query] = await Promise.all([params, searchParams]);
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [viewer, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  const data = await getIndicator(viewer, decodeURIComponent(slug));
  if (!data) notFound();
  const { indicator, figures, citations, citationsThisYear, following } = data;
  const geoParam = typeof query.geo === "string" ? query.geo : undefined;
  const page = Math.max(1, Number(query.page) || 1);
  const view = buildIndicatorView(figures, { geography: geoParam, defaultGeography: indicator.default_geography });
  const base = `/${locale}/registry`;
  const name = locale === "ar" ? indicator.name_ar : indicator.name_en;
  const definition = locale === "ar" ? indicator.definition_ar : indicator.definition_en;
  const unit = localizeUnit(indicator.unit, locale);
  const topTier = view.sources[0]?.tier;
  const byId = new Map(figures.map((f) => [f.id, f]));
  const href = (next: { geo?: string; page?: number }) => {
    const search = new URLSearchParams();
    const geo = next.geo ?? (geoParam ? view.geography : undefined);
    if (geo) search.set("geo", geo);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const s = search.toString();
    return `${base}/indicators/${indicator.slug}${s ? `?${s}` : ""}`;
  };

  // How the newsroom has cited it: verdict counts and the most common difference.
  const counts = { match: 0, context: 0, differs: 0, none: 0 };
  const fields = new Map<string, number>();
  for (const c of citations) {
    if (c.result?.verdict) counts[c.result.verdict] += 1;
    for (const field of c.result?.differing_fields ?? []) fields.set(field, (fields.get(field) ?? 0) + 1);
  }
  const commonField = [...fields.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const rows = view.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const latest = view.latest;
  const second = view.ytd ?? view.latestYear;

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("registry.title"), href: base }, { label: name }]} />
      <PageHeader
        title={name}
        badge={topTier ? <TierBadge tier={topTier} t={t} /> : undefined}
        subtitle={[
          indicator.topic ? (locale === "ar" ? indicator.topic.name_ar : indicator.topic.name_en) : null,
          geoLabel(view.geography, t),
          frequencyLabel(indicator.frequency, t),
          unit || (indicator.unit === "%" ? "%" : null),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <FollowButton targetType="indicator" targetId={indicator.id} following={following} />
            <ButtonLink href={`/${locale}/briefs/new?indicator=${indicator.slug}`} icon="brief">
              {t("registry.prepareBrief")}
            </ButtonLink>
            <ButtonLink href={`/${locale}/checks/new?source=text`} variant="primary" icon="checks">
              {t("registry.useInCheck")}
            </ButtonLink>
          </>
        }
      />

      {view.geographies.length > 1 && (
        <nav aria-label={t("registry.indicator.allGeographies")} className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{t("registry.indicator.allGeographies")}:</span>
          {view.geographies.map((g) => (
            <Link
              key={g}
              href={href({ geo: g })}
              aria-current={g === view.geography ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                g === view.geography ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-border bg-surface hover:border-border-strong",
              )}
            >
              {geoLabel(g, t)}
            </Link>
          ))}
        </nav>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={t("registry.indicator.latest")}
          icon={<Icon name="refresh" size={16} />}
          value={latest ? compactFigure(latest, locale) : "—"}
          detail={latest ? [periodText(latest.period_start, latest.period_end, locale), latest.status !== "final" ? t(`registry.figureStatus.${latest.status}`) : null].filter(Boolean).join(" · ") : t("registry.noFiguresYet")}
        />
        {second && (
          <Metric
            label={view.ytd ? t("registry.indicator.sinceStart") : t("registry.indicator.granularity.year")}
            icon={<Icon name="calendar" size={16} />}
            value={compactFigure(second, locale)}
            detail={periodText(second.period_start, second.period_end, locale)}
          />
        )}
        <Metric
          label={t("registry.indicator.yoy")}
          icon={<Icon name="chart" size={16} />}
          value={view.yoy ? signedPercent(view.yoy.change, locale) : "—"}
          detail={
            view.yoy?.kind === "official"
              ? t("registry.indicator.yoyOfficial", { period: periodText(view.yoy.figure.period_start, view.yoy.figure.period_end, locale) })
              : view.yoy?.kind === "computed"
                ? t("registry.indicator.yoyComputed", { period: periodText(view.yoy.previous.period_start, view.yoy.previous.period_end, locale) })
                : t("registry.indicator.noComparison")
          }
        />
        <Metric label={t("registry.indicator.citedInNewsroom")} icon={<Icon name="checks" size={16} />} value={citationsThisYear} detail={t("registry.indicator.citedDetail")} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-4 md:p-5">
            <IndicatorChart
              key={view.geography}
              title={t("registry.indicator.chartTitle", { indicator: name })}
              series={view.series}
              granularities={view.granularities}
              initial={view.defaultGranularity}
            />
          </Card>

          <Card className="overflow-hidden">
            <h2 className="px-5 pt-4 pb-3 text-[15px] font-semibold">{t("registry.indicator.byPeriod")}</h2>
            {view.rows.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">{t("registry.indicator.noFigures")}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-y border-border bg-surface-sunken/60 text-xs text-muted">
                        <th className="px-5 py-2.5 text-start font-medium">{t("registry.indicator.columns.period")}</th>
                        <th className="px-3 py-2.5 text-start font-medium">{t("registry.indicator.columns.value")}</th>
                        <th className="px-3 py-2.5 text-start font-medium">{t("registry.indicator.columns.status")}</th>
                        <th className="px-3 py-2.5 text-start font-medium">{t("registry.indicator.columns.document")}</th>
                        <th className="px-5 py-2.5 text-start font-medium">{t("registry.indicator.columns.retrieved")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((f) => {
                        const previous = revisedFrom(f, byId);
                        return (
                          <tr key={f.id} className={cn("border-b border-border last:border-b-0", !f.is_current && "text-muted")}>
                            <td className="px-5 py-3">
                              <p className="font-medium">{periodText(f.period_start, f.period_end, locale)}</p>
                              {f.measure !== "level" && <p className="text-xs text-muted">{t(`registry.measure.${f.measure}` as MessageKey)}</p>}
                            </td>
                            <td className="num px-3 py-3 font-semibold">
                              {fullFigure(f, locale)}
                              {previous && <p className="text-xs font-normal text-muted">{t("registry.indicator.revisedFrom", { value: fullFigure(previous, locale) })}</p>}
                            </td>
                            <td className="px-3 py-3">
                              {f.is_current ? (
                                <StatusPill status={previous ? "revised" : f.status} t={t} />
                              ) : (
                                <span className="text-xs">{t("registry.indicator.superseded")}</span>
                              )}
                            </td>
                            <td className="max-w-[260px] px-3 py-3">
                              <Link href={`${base}/documents/${f.document_id}?figure=${f.id}`} className="line-clamp-2 text-accent hover:underline">
                                {f.document?.title}
                                {f.version && f.version.version > 1 && <span className="num"> · v{f.version.version}</span>}
                              </Link>
                            </td>
                            <td className="px-5 py-3 text-xs whitespace-nowrap text-muted">{f.version?.fetched_at ? formatDate(f.version.fetched_at, locale) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  total={view.rows.length}
                  pageSize={PAGE_SIZE}
                  hrefFor={(p) => href({ page: p })}
                  summary={t("common.showing", { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, view.rows.length), total: view.rows.length })}
                />
              </>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <SideCard title={t("registry.indicator.definition")}>
            <p className="text-sm leading-relaxed text-muted">{definition || t("registry.indicator.noDefinition")}</p>
          </SideCard>
          <SideCard title={t("registry.indicator.sources")} count={view.sources.length}>
            {view.sources.length === 0 ? (
              <p className="text-sm text-muted">{t("registry.noFiguresYet")}</p>
            ) : (
              <ul className="space-y-3">
                {view.sources.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{locale === "ar" ? s.name_ar : s.name_en}</p>
                      <div className="mt-1">
                        <TierBadge tier={s.tier} t={t} />
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{s.fetchedAt ? formatRelative(s.fetchedAt, locale) : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>
          <SideCard title={t("registry.indicator.howCited")}>
            {citations.length === 0 ? (
              <p className="text-sm text-muted">{t("registry.indicator.noCitations")}</p>
            ) : (
              <>
                <VerdictCounts counts={counts} className="text-sm" />
                {commonField && (
                  <p className="mt-3 text-xs text-muted">
                    {t("registry.indicator.commonMismatch", { field: t(`differences.${commonField}` as MessageKey) })}
                  </p>
                )}
                <ul className="mt-3 space-y-2">
                  {citations.slice(0, 4).map((c) => (
                    <li key={c.id}>
                      <Link href={`/${locale}/checks/${c.check?.id}?claim=${c.id}`} className="line-clamp-2 text-xs text-accent hover:underline">
                        «{c.span_text}»
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SideCard>
        </aside>
      </div>
    </>
  );
}

export default function IndicatorPage(props: Props) {
  return (
    <Suspense fallback={<IndicatorSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}

function IndicatorSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full max-w-80" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </div>
  );
}
