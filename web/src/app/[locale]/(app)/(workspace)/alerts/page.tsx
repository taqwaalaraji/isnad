import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader, Skeleton } from "@/components/ui/card";
import { AlertsView } from "@/features/alerts/alerts-view";
import { ALERT_FILTERS, type AlertFilter } from "@/features/alerts/groups";
import { alertsPageData } from "@/features/alerts/queries";
import { requireNewsroom } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/alerts">;

async function Content({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const [viewer, t, query] = await Promise.all([requireNewsroom(locale), getT(locale), searchParams]);
  const filter = ALERT_FILTERS.includes(query.filter as AlertFilter) ? (query.filter as AlertFilter) : "all";
  const data = await alertsPageData(viewer, filter);
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("alerts.title") }]} />
      <PageHeader title={t("alerts.title")} subtitle={t("alerts.subtitle")} />
      <AlertsView data={data} filter={filter} newsroomId={viewer.active.newsroomId} />
    </>
  );
}

export default async function AlertsPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <Content locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
