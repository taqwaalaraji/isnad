import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader, Skeleton } from "@/components/ui/card";
import { formOptions } from "@/features/console/queries";
import { SourceForm } from "@/features/console/sources/source-form";
import { requireStaff } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

async function Content({ locale }: { locale: Locale }) {
  // The access check comes first: it marks the request dynamic before any query reads the clock.
  await requireStaff(locale);
  const [t, options] = await Promise.all([getT(locale), formOptions()]);
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("console.sources.title"), href: `/${locale}/console/sources` }, { label: t("console.sources.addTitle") }]} />
      <PageHeader title={t("console.sources.addTitle")} subtitle={t("console.sources.addBody")} />
      <div className="max-w-4xl">
        <SourceForm options={options} />
      </div>
    </>
  );
}

export default async function NewSourcePage({ params }: PageProps<"/[locale]/console/sources/new">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-[640px] w-full max-w-4xl rounded-lg" />}>
      <Content locale={locale} />
    </Suspense>
  );
}
