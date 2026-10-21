import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader, Skeleton } from "@/components/ui/card";
import { privateSources } from "@/features/admin/queries";
import { SourcesPanel } from "@/features/admin/sources-panel";
import { requireNewsroomRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

async function Content({ locale }: { locale: Locale }) {
  const [viewer, t] = await Promise.all([requireNewsroomRole(locale, ["admin"]), getT(locale)]);
  const { sources, proposals } = await privateSources(viewer.active.newsroomId);
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("admin.privateSources.title") }]} />
      <PageHeader title={t("admin.privateSources.title")} subtitle={t("admin.privateSources.subtitle", { newsroom: viewer.active.newsroomName })} />
      <SourcesPanel sources={sources} proposals={proposals} />
    </>
  );
}

export default async function PrivateSourcesPage({ params }: PageProps<"/[locale]/admin/sources">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <Content locale={locale} />
    </Suspense>
  );
}
