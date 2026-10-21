import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader, Skeleton } from "@/components/ui/card";
import { PoliciesForm } from "@/features/admin/policies-form";
import { newsroomPolicies } from "@/features/admin/queries";
import { requireNewsroomRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

async function Content({ locale }: { locale: Locale }) {
  const [viewer, t] = await Promise.all([requireNewsroomRole(locale, ["admin"]), getT(locale)]);
  const policies = await newsroomPolicies(viewer.active.newsroomId);
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("admin.policies.title") }]} />
      <PageHeader title={t("admin.policies.title")} subtitle={t("admin.policies.subtitle", { newsroom: viewer.active.newsroomName })} />
      <PoliciesForm key={JSON.stringify(policies)} policies={policies} />
    </>
  );
}

export default async function PoliciesPage({ params }: PageProps<"/[locale]/admin/policies">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-lg" />}>
      <Content locale={locale} />
    </Suspense>
  );
}
