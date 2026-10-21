import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { Nuqta } from "@/components/ui/nuqta";
import { SideCard, TierBadge, UpdatedAt, geoLabel } from "@/features/registry/components";
import { FollowButton } from "@/features/registry/follow-button";
import { compactFigure, differsBeyondRounding, fullFigure, periodText } from "@/features/registry/format";
import { type FigureRow, getEntity } from "@/features/registry/queries";
import { requireNewsroom } from "@/lib/auth";
import { formatDate, formatNumber } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";

type Props = PageProps<"/[locale]/registry/entities/[slug]">;
const TABS = ["timeline", "indicators", "releases"] as const;
type Tab = (typeof TABS)[number];

async function Content({ params, searchParams }: Props) {
  const [{ locale: raw, slug }, query] = await Promise.all([params, searchParams]);
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [viewer, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  const data = await getEntity(viewer, decodeURIComponent(slug));
  if (!data) notFound();
  const { entity, sources, figures, previous, documents, citations, following } = data;
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : "timeline";
  const topic = typeof query.topic === "string" ? query.topic : undefined;
  const base = `/${locale}/registry`;
  const self = `${base}/entities/${entity.slug}`;
  const name = locale === "ar" ? entity.name_ar : entity.name_en;
  const label = (row: { name_ar: string; name_en: string }) => (locale === "ar" ? row.name_ar : row.name_en);

  // Indicators it publishes: the latest current figure of each, and how many figures there are.
  const byIndicator = new Map<string, { indicator: NonNullable<(typeof figures)[number]["indicator"]>; latest: FigureRow; count: number }>();
  for (const f of figures) {
    if (!f.indicator) continue;
    const entry = byIndicator.get(f.indicator.id);
    if (!entry) byIndicator.set(f.indicator.id, { indicator: f.indicator, latest: f, count: 1 });
    else {
      entry.count += 1;
      if (f.is_current && (f.period_end > entry.latest.period_end || !entry.latest.is_current)) entry.latest = f;
    }
  }
  const indicators = [...byIndicator.values()].sort((a, b) => b.count - a.count);

  const topics = new Map<string, { slug: string; name_ar: string; name_en: string }>();
  for (const f of figures) if (f.indicator?.topic) topics.set(f.indicator.topic.slug, f.indicator.topic);
  const timeline = figures
    .filter((f) => f.is_current && (!topic || f.indicator?.topic?.slug === topic))
    .sort((a, b) => (b.version?.fetched_at ?? b.created_at).localeCompare(a.version?.fetched_at ?? a.created_at) || b.period_end.localeCompare(a.period_end))
    .slice(0, 40);

  const cited = new Map<string, { indicator: (typeof citations)[number]; count: number }>();
  for (const c of citations) {
    const entry = cited.get(c.id) ?? { indicator: c, count: 0 };
    entry.count += 1;
    cited.set(c.id, entry);
  }
  const mostCited = [...cited.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const topTier = sources[0]?.tier;
  const website = entity.website ? entity.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;

  const tabHref = (next: Tab) => (next === "timeline" ? self : `${self}?tab=${next}`);
  const counts: Record<Tab, number> = { timeline: figures.filter((f) => f.is_current).length, indicators: indicators.length, releases: documents.length };

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("registry.title"), href: base }, { label: name }]} />
      <PageHeader
        title={name}
        badge={topTier ? <TierBadge tier={topTier} t={t} /> : undefined}
        subtitle={
          <>
            {[
              t(`registry.entity.kind.${entity.kind}` as MessageKey),
              t(`registry.entity.level.${entity.level}` as MessageKey),
              indicators.length ? t("registry.entity.originOf", { n: formatNumber(indicators.length, locale) }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {website && (
              <>
                {" · "}
                <a href={entity.website!} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" dir="ltr">
                  {website}
                </a>
              </>
            )}
          </>
        }
        actions={
          <>
            <FollowButton targetType="entity" targetId={entity.id} following={following} />
            <ButtonLink href={`/${locale}/briefs/new?entity=${entity.slug}`} variant="primary" icon="brief">
              {t("registry.prepareBrief")}
            </ButtonLink>
          </>
        }
      />

      <nav className="mb-6 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none]" aria-label={name}>
        {TABS.map((key) => (
          <Link
            key={key}
            href={tabHref(key)}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium",
              tab === key ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t(`registry.entity.tabs.${key}`)}
            <span className={cn("num rounded-full px-1.5 text-[11px]", tab === key ? "bg-accent text-on-accent" : "bg-surface-sunken text-muted")}>{counts[key]}</span>
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {tab === "timeline" && (
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold">{t("registry.entity.timeline")}</h2>
                  <p className="text-xs text-muted">{t("registry.entity.timelineHint")}</p>
                </div>
                {topics.size > 1 && (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={self}
                      className={cn("rounded-full border px-3 py-1 text-xs", !topic ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-border hover:border-border-strong")}
                    >
                      {t("registry.entity.allTopics")}
                    </Link>
                    {[...topics.values()].map((tp) => (
                      <Link
                        key={tp.slug}
                        href={`${self}?topic=${tp.slug}`}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs",
                          topic === tp.slug ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-border hover:border-border-strong",
                        )}
                      >
                        {label(tp)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              {timeline.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">{t("registry.entity.noFigures")}</p>
              ) : (
                <ol className="relative space-y-5 border-s border-border ps-6">
                  {timeline.map((f) => {
                    const old = f.supersedes_id ? previous.get(f.supersedes_id) : undefined;
                    const revised = !!old && differsBeyondRounding(old, f);
                    return (
                      <li key={f.id} className="relative">
                        <span className="absolute -start-[29px] top-1.5">
                          <Nuqta tone={revised ? "accent" : "ink"} size={8} />
                        </span>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="num">{formatDate(f.document?.published_at ?? f.version?.fetched_at ?? f.created_at, locale, "long")}</span>
                          {revised && <span className="rounded-sm border border-accent px-1.5 text-accent">{t("registry.entity.revision")}</span>}
                        </div>
                        <Link href={`${base}/documents/${f.document_id}?figure=${f.id}`} className="group mt-1 block">
                          <p className="num font-semibold group-hover:text-accent">
                            {fullFigure(f, locale)} · {f.indicator ? label(f.indicator) : ""}
                            <span className="font-normal text-muted"> · {periodText(f.period_start, f.period_end, locale)}</span>
                            {f.geography !== "UAE" && <span className="font-normal text-muted"> · {geoLabel(f.geography, t)}</span>}
                          </p>
                          <p className="text-xs text-muted">
                            {revised ? `${fullFigure(old!, locale)} ← ${fullFigure(f, locale)}` : f.document?.title}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          )}

          {tab === "indicators" && (
            <Card className="overflow-hidden">
              {indicators.length === 0 ? (
                <EmptyState icon={<Icon name="catalog" size={32} />} title={t("registry.entity.noFigures")} />
              ) : (
                <ul>
                  {indicators.map(({ indicator, latest, count }) => (
                    <li key={indicator.id}>
                      <Link
                        href={`${base}/indicators/${indicator.slug}`}
                        className="flex items-center gap-4 border-t border-border px-5 py-3.5 first:border-t-0 hover:bg-surface-sunken/50"
                      >
                        <Nuqta tone="accent" size={7} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{label(indicator)}</p>
                          <p className="text-xs text-muted">
                            {[indicator.topic ? label(indicator.topic) : null, t("registry.entity.figuresCount", { n: count })].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="text-end">
                          <p className="num font-semibold">{compactFigure(latest, locale)}</p>
                          <p className="text-xs text-muted">{periodText(latest.period_start, latest.period_end, locale)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === "releases" && (
            <Card className="overflow-hidden">
              {documents.length === 0 ? (
                <EmptyState icon={<Icon name="file" size={32} />} title={t("registry.entity.noReleases")} />
              ) : (
                <ul>
                  {documents.map((d) => (
                    <li key={d.id}>
                      <Link href={`${base}/documents/${d.id}`} className="flex items-start gap-3 border-t border-border px-5 py-3.5 first:border-t-0 hover:bg-surface-sunken/50">
                        <Icon name={d.kind === "xlsx" || d.kind === "csv" ? "table" : "file"} size={18} className="mt-0.5 shrink-0 text-muted" />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-medium">{d.title}</p>
                          <p className="num text-xs text-muted">
                            {[
                              t(`registry.document.kind.${d.kind}` as MessageKey),
                              d.published_at ? t("registry.document.publishedOn", { date: formatDate(d.published_at, locale) }) : null,
                              d.version ? t("registry.document.version", { n: d.version.version }) : null,
                              d.version ? t("registry.figuresCount", { n: d.version.figures_count }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <SideCard title={t("registry.entity.mostCited")}>
            {mostCited.length === 0 ? (
              <p className="text-sm text-muted">{t("registry.entity.noCitations")}</p>
            ) : (
              <ul className="space-y-2">
                {mostCited.map(({ indicator, count }) => (
                  <li key={indicator.id}>
                    <Link href={`${base}/indicators/${indicator.slug}`} className="flex items-center gap-2 py-1 text-sm hover:text-accent">
                      <Nuqta tone="accent" size={7} />
                      <span className="flex-1 truncate">{label(indicator)}</span>
                      <span className="num text-xs text-muted">{count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>
          <SideCard title={t("registry.entity.sourcesTitle")} count={sources.length}>
            <ul className="space-y-3">
              {sources.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label(s)}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <TierBadge tier={s.tier} t={t} short />
                      {s.homepage_url && (
                        <a href={s.homepage_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline" aria-label={t("registry.entity.website")}>
                          <Icon name="external" size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    <UpdatedAt value={s.last_fetched_at} locale={locale} t={t} />
                  </span>
                </li>
              ))}
            </ul>
          </SideCard>
          <section className="rounded-lg bg-accent-soft p-5">
            <h2 className="text-[15px] font-semibold">{t("registry.entity.briefTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("registry.entity.briefBody")}</p>
            <ButtonLink href={`/${locale}/briefs/new?entity=${entity.slug}`} variant="primary" size="sm" icon="brief" className="mt-3">
              {t("registry.prepareBrief")}
            </ButtonLink>
          </section>
        </aside>
      </div>
    </>
  );
}

export default function EntityPage(props: Props) {
  return (
    <Suspense fallback={<EntitySkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}

function EntitySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full max-w-72" />
      <Skeleton className="h-8 w-full max-w-96" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    </div>
  );
}
