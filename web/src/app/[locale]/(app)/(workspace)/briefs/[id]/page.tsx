import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Card, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { BriefControls, BriefRealtime } from "@/features/briefs/brief-controls";
import { BriefSheet } from "@/features/briefs/brief-sheet";
import { getBrief } from "@/features/briefs/queries";
import { requireNewsroom } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/briefs/[id]">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Content({ params }: Props) {
  const { locale: raw, id } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [viewer, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  if (!UUID.test(id)) notFound();
  const brief = await getBrief(id);
  if (!brief) notFound();
  const generating = brief.status === "generating";
  const entity = brief.entity ? (locale === "ar" ? brief.entity.name_ar : brief.entity.name_en) : "";

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("briefs.title"), href: `/${locale}/briefs` }, { label: brief.title }]} />
      <BriefRealtime briefId={brief.id} />
      <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{t("briefs.sheetFor", { entity: brief.title })}</h1>
          <p className="mt-1 text-sm text-muted">
            {[entity !== brief.title ? entity : null, brief.interview_date && formatDate(brief.interview_date, locale, "long"), t("briefs.updatedAt", { date: formatDate(brief.updated_at, locale, "datetime") })]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <BriefControls briefId={brief.id} generating={generating} canDelete={brief.created_by === viewer.id || viewer.active.role === "admin"} />
      </header>

      {generating ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Icon name="loader" size={28} className="animate-spin text-accent" />
          <p className="font-semibold">{t("briefs.generating")}</p>
          <p className="max-w-md text-sm text-muted">{t("briefs.generatingBody")}</p>
        </Card>
      ) : brief.status === "failed" ? (
        <Card className="flex items-start gap-3 bg-differ-tint p-5 text-differ-text">
          <Icon name="alert" size={18} className="mt-0.5" />
          <div>
            <p className="font-semibold">{t("briefs.failed")}</p>
            <p className="mt-1 text-sm">{t("briefs.failedBody")}</p>
          </div>
        </Card>
      ) : (
        <div className="mx-auto max-w-3xl">
          <BriefSheet brief={brief} locale={locale} t={t} newsroomName={viewer.active.newsroomName} />
        </div>
      )}
    </>
  );
}

export default function BriefPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-lg" />}>
      <Content {...props} />
    </Suspense>
  );
}
