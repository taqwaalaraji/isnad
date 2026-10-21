import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader, Skeleton } from "@/components/ui/card";
import { MembersPanel } from "@/features/admin/members-panel";
import { membersPageData } from "@/features/admin/queries";
import { requireNewsroomRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/admin/members">;

async function Content({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const [viewer, t, query] = await Promise.all([requireNewsroomRole(locale, ["admin"]), getT(locale), searchParams]);
  const data = await membersPageData(viewer.active.newsroomId);
  const tab = query.tab === "desks" || query.tab === "invitations" ? query.tab : "members";
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("admin.members.title") }]} />
      <PageHeader title={t("admin.members.title")} subtitle={t("admin.members.subtitle", { newsroom: viewer.active.newsroomName })} />
      <MembersPanel data={data} viewerId={viewer.id} initialTab={tab} />
    </>
  );
}

export default async function MembersPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Content locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}

function AdminSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-10 w-full max-w-lg" />
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}
