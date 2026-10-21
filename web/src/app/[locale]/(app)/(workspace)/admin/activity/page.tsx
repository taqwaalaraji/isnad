import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Skeleton } from "@/components/ui/card";
import { ActivityView } from "@/features/admin/activity-view";
import { activityPageData } from "@/features/admin/queries";
import { requireNewsroomRole } from "@/lib/auth";
import { intlLocale, isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/admin/activity">;

function monthName(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "long", year: "numeric", timeZone: "Asia/Dubai" }).format(new Date(iso));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Content({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const [viewer, t, query] = await Promise.all([requireNewsroomRole(locale, ["admin"]), getT(locale), searchParams]);
  const userId = typeof query.user === "string" && UUID.test(query.user) ? query.user : undefined;
  const before = typeof query.before === "string" && !Number.isNaN(Date.parse(query.before)) ? query.before : undefined;
  const data = await activityPageData(viewer.active.newsroomId, { before, userId });
  const base = `/${locale}/admin/activity`;
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("admin.activity.title") }]} />
      <PageHeader
        title={t("admin.activity.title")}
        subtitle={t("admin.activity.subtitleMonth", { month: monthName(data.stats.month_start, locale) })}
        actions={
          <ButtonLink href={`/api/admin/activity?locale=${locale}`} icon="download" prefetch={false}>
            {t("admin.activity.export")}
          </ButtonLink>
        }
      />
      <ActivityView locale={locale} t={t} {...data} userId={userId} base={base} />
    </>
  );
}

export default async function ActivityPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-lg" />}>
      <Content locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
