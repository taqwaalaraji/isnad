import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { IndicatorProposalCard, SourceProposalCard } from "@/features/console/proposals/proposal-cards";
import { catalogOptions, indicatorProposals, sourceProposals } from "@/features/console/queries";
import { requireStaff } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

async function Content({ locale }: { locale: Locale }) {
  const [, t] = await Promise.all([requireStaff(locale), getT(locale)]);
  const [sources, indicators, options] = await Promise.all([sourceProposals(), indicatorProposals(), catalogOptions()]);
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("console.proposals.title") }]} />
      <PageHeader title={t("console.proposals.title")} subtitle={t("console.proposals.subtitle")} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            {t("console.proposals.sourcesTitle")}
            <span className="num rounded-full bg-surface-sunken px-2 text-xs text-muted">{sources.length}</span>
          </h2>
          {sources.length === 0 ? (
            <Card>
              <EmptyState icon={<Icon name="proposal" size={28} />} title={t("console.proposals.empty")} />
            </Card>
          ) : (
            sources.map((proposal) => <SourceProposalCard key={proposal.id} proposal={proposal} />)
          )}
        </section>
        <section className="min-w-0 space-y-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            {t("console.proposals.indicatorsTitle")}
            <span className="num rounded-full bg-surface-sunken px-2 text-xs text-muted">{indicators.length}</span>
          </h2>
          {indicators.length === 0 ? (
            <Card>
              <EmptyState icon={<Icon name="catalog" size={28} />} title={t("console.proposals.emptyIndicators")} />
            </Card>
          ) : (
            indicators.map((proposal) => <IndicatorProposalCard key={proposal.note} proposal={proposal} topics={options.topics} />)
          )}
        </section>
      </div>
    </>
  );
}

export default async function ProposalsPage({ params }: PageProps<"/[locale]/console/proposals">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-lg" />}>
      <Content locale={locale} />
    </Suspense>
  );
}
