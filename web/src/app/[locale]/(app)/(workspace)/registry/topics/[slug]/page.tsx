import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { IndicatorRow, SideCard, TierBadge, TopicTile, UpdatedAt, frequencyLabel, geoLabel } from "@/features/registry/components";
import { getTopic } from "@/features/registry/queries";
import { requireNewsroom } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/registry/topics/[slug]">;

async function Content({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  const data = await getTopic(decodeURIComponent(slug));
  if (!data) notFound();
  const { topic, indicators, sources } = data;
  const base = `/${locale}/registry`;
  const name = locale === "ar" ? topic.name_ar : topic.name_en;
  // Indicators with figures first, newest period first.
  const ordered = [...indicators].sort(
    (a, b) => Number(!!b.figure) - Number(!!a.figure) || (b.figure?.period_end ?? "").localeCompare(a.figure?.period_end ?? "") || a.name_en.localeCompare(b.name_en),
  );

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("registry.title"), href: base }, { label: name }]} />
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <TopicTile icon={topic.icon} />
            {name}
          </span>
        }
        subtitle={`${t("registry.indicatorsCount", { n: indicators.length })} · ${t("registry.sourcesCount", { n: sources.length })}`}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <h2 className="px-5 pt-4 pb-3 text-[15px] font-semibold">{t("registry.topic.indicators")}</h2>
          {ordered.length === 0 ? (
            <EmptyState icon={<Icon name="catalog" size={32} />} title={t("registry.topic.noIndicators")} />
          ) : (
            <ul>
              {ordered.map((i) => (
                <IndicatorRow
                  key={i.id}
                  href={`${base}/indicators/${i.slug}`}
                  name={locale === "ar" ? i.name_ar : i.name_en}
                  meta={[i.figure ? geoLabel(i.figure.geography, t) : geoLabel(i.default_geography, t), frequencyLabel(i.frequency, t)].filter(Boolean).join(" · ")}
                  figure={i.figure}
                  series={i.series}
                  tier={i.figure?.source?.tier ?? null}
                  locale={locale}
                  t={t}
                />
              ))}
            </ul>
          )}
        </Card>
        <SideCard title={t("registry.topic.sources")} count={sources.length} className="h-fit">
          {sources.length === 0 ? (
            <p className="text-sm text-muted">{t("registry.topic.noSources")}</p>
          ) : (
            <ul className="space-y-3">
              {sources.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {s.entity ? (
                      <Link href={`${base}/entities/${s.entity.slug}`} className="text-sm font-medium hover:text-accent">
                        {locale === "ar" ? s.name_ar : s.name_en}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">{locale === "ar" ? s.name_ar : s.name_en}</p>
                    )}
                    <div className="mt-1">
                      <TierBadge tier={s.tier} t={t} short />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    <UpdatedAt value={s.last_fetched_at} locale={locale} t={t} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SideCard>
      </div>
    </>
  );
}

export default function TopicPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[520px] w-full rounded-lg" />}>
      <Content {...props} />
    </Suspense>
  );
}
