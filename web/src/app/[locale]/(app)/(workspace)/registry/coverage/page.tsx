import Link from "next/link";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Card, Metric, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { TopicTile, UpdatedAt } from "@/features/registry/components";
import { registryStats, topicStats } from "@/features/registry/queries";
import { requireNewsroom } from "@/lib/auth";
import { formatNumber, formatRelative } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/registry/coverage">;

async function Content({ params }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  const [stats, topics] = await Promise.all([registryStats(), topicStats()]);
  const base = `/${locale}/registry`;
  const rows = [...topics].sort((a, b) => b.figures - a.figures || a.sort_order - b.sort_order);

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("registry.title"), href: base }, { label: t("registry.coverageTitle") }]} />
      <PageHeader title={t("registry.coverageTitle")} subtitle={t("registry.coverageSubtitle")} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={t("registry.coverageMetrics.sources")}
          icon={<Icon name="building" size={16} />}
          value={formatNumber(stats.sources, locale)}
          detail={t("registry.coverageMetrics.sourcesDetail", { n: formatNumber(stats.tier1_sources, locale) })}
        />
        <Metric
          label={t("registry.coverageMetrics.indicators")}
          icon={<Icon name="catalog" size={16} />}
          value={formatNumber(stats.indicators, locale)}
          detail={t("registry.coverageMetrics.indicatorsDetail", { n: formatNumber(stats.topics, locale) })}
        />
        <Metric
          label={t("registry.coverageMetrics.figures")}
          icon={<Icon name="table" size={16} />}
          value={formatNumber(stats.figures, locale)}
          detail={t("registry.coverageMetrics.figuresDetail")}
        />
        <Metric
          label={t("registry.coverageMetrics.lastFetch")}
          icon={<Icon name="refresh" size={16} />}
          value={<span className="text-xl">{stats.last_fetched_at ? formatRelative(stats.last_fetched_at, locale) : "—"}</span>}
          detail={t("registry.coverageMetrics.lastFetchDetail", { n: formatNumber(stats.fresh_sources, locale) })}
        />
      </div>

      <Card className="mb-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken/60 text-xs text-muted">
                <th className="px-6 py-3 text-start font-medium">{t("registry.coverageColumns.topic")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("registry.coverageColumns.indicators")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("registry.coverageColumns.sources")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("registry.coverageColumns.figures")}</th>
                <th className="w-[240px] px-3 py-3 text-start font-medium">{t("registry.coverageColumns.freshness")}</th>
                <th className="px-6 py-3 text-start font-medium">{t("registry.coverageColumns.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((topic) => {
                const fresh = (topic.fresh_sources / Math.max(1, topic.sources)) * 100;
                return (
                  <tr key={topic.id} className="border-b border-border last:border-b-0 hover:bg-surface-sunken/40">
                    <td className="px-6 py-3.5">
                      <Link href={`${base}/topics/${topic.slug}`} className="flex items-center gap-3 font-semibold hover:text-accent">
                        <TopicTile icon={topic.icon} />
                        {locale === "ar" ? topic.name_ar : topic.name_en}
                      </Link>
                    </td>
                    <td className="num px-3 py-3.5">{formatNumber(topic.indicators, locale)}</td>
                    <td className="num px-3 py-3.5">{formatNumber(topic.sources, locale)}</td>
                    <td className="num px-3 py-3.5">{formatNumber(topic.figures, locale)}</td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-3">
                        <ProgressBar value={fresh} label={t("registry.coverageColumns.freshness")} className="flex-1" />
                        <span className="num w-10 text-xs text-muted">{Math.round(fresh)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-muted">
                      <UpdatedAt value={topic.last_updated_at} locale={locale} t={t} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-lg bg-surface-sunken/70 p-5">
          <h2 className="text-[15px] font-semibold">{t("registry.outOfCoverageTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("registry.outOfCoverageBody")}</p>
        </section>
        <section className="rounded-lg bg-surface-sunken/70 p-5">
          <h2 className="text-[15px] font-semibold">{t("registry.freshnessTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("registry.freshnessBody")}</p>
        </section>
      </div>
    </>
  );
}

export default function CoveragePage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-10 w-full max-w-48" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      }
    >
      <Content {...props} />
    </Suspense>
  );
}
