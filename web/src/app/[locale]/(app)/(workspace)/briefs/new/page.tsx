import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Card, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { BriefForm } from "@/features/briefs/brief-form";
import { briefFormOptions, resolveBriefPrefill } from "@/features/briefs/queries";
import { requireNewsroom } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/briefs/new">;

async function Content({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  // The access check comes first: it marks the request dynamic before any query reads the clock.
  await requireNewsroom(locale);
  const [t, options, query] = await Promise.all([getT(locale), briefFormOptions(), searchParams]);
  const prefill = await resolveBriefPrefill({
    entity: typeof query.entity === "string" ? query.entity : undefined,
    indicator: typeof query.indicator === "string" ? query.indicator : undefined,
  });
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("briefs.title"), href: `/${locale}/briefs` }, { label: t("briefs.new") }]} />
      <PageHeader title={t("briefs.new")} subtitle={t("briefs.newSubtitle")} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <BriefForm options={options} initialEntity={prefill.entityId} initialTopic={prefill.topicId} />
        <Card className="h-fit p-5 text-sm text-muted">
          <p className="mb-2 flex items-center gap-2 font-semibold text-text">
            <Icon name="info" size={16} className="text-accent" />
            {t("briefs.howTitle")}
          </p>
          <p>{t("briefs.howBody")}</p>
        </Card>
      </div>
    </>
  );
}

export default async function NewBriefPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <Content locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
