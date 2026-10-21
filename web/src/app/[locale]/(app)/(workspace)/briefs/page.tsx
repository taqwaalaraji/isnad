import Link from "next/link";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { type BriefRow, listBriefs } from "@/features/briefs/queries";
import { requireNewsroom } from "@/lib/auth";
import { formatDate, formatRelative } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";

const STATUS_STYLE: Record<string, string> = {
  ready: "bg-accent-soft text-accent",
  generating: "bg-surface-sunken text-muted",
  failed: "bg-differ-tint text-differ-text",
};

function BriefCard({ brief, locale, t }: { brief: BriefRow; locale: Locale; t: Translate }) {
  const entity = brief.entity ? (locale === "ar" ? brief.entity.name_ar : brief.entity.name_en) : "";
  const topic = brief.topic ? (locale === "ar" ? brief.topic.name_ar : brief.topic.name_en) : null;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-surface-sunken text-muted">
          <Icon name="brief" size={18} />
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[brief.status] ?? ""}`}>{t(`briefs.status.${brief.status as "ready"}`)}</span>
      </div>
      <h2 className="mt-3 line-clamp-2 font-semibold">{brief.title}</h2>
      <p className="mt-1 line-clamp-2 text-sm text-muted">{[entity !== brief.title ? entity : null, topic].filter(Boolean).join(" · ") || t("briefs.anyTopic")}</p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="calendar" size={14} />
          {brief.interview_date ? formatDate(brief.interview_date, locale) : formatRelative(brief.created_at, locale)}
        </span>
        <Link href={`/${locale}/briefs/${brief.id}`} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          <Icon name="external" size={14} />
          {t("briefs.open")}
        </Link>
      </div>
    </Card>
  );
}

async function Content({ locale }: { locale: Locale }) {
  const [viewer, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  const briefs = await listBriefs(viewer.active.newsroomId);
  const newHref = `/${locale}/briefs/new`;
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("briefs.title") }]} />
      <PageHeader
        title={t("briefs.title")}
        subtitle={t("briefs.subtitle")}
        actions={
          <ButtonLink href={newHref} variant="primary" icon="plus">
            {t("briefs.new")}
          </ButtonLink>
        }
      />
      {briefs.length > 0 && (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {briefs.map((b) => (
            <BriefCard key={b.id} brief={b} locale={locale} t={t} />
          ))}
        </div>
      )}
      <Card>
        <EmptyState
          icon={
            <span className="flex size-12 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name="brief" size={22} />
            </span>
          }
          title={t("briefs.prepareTitle")}
          body={t("briefs.prepareBody")}
          action={
            <ButtonLink href={newHref} variant="primary" icon="plus">
              {t("briefs.new")}
            </ButtonLink>
          }
        />
      </Card>
    </>
  );
}

export default async function BriefsPage({ params }: PageProps<"/[locale]/briefs">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <Content locale={locale} />
    </Suspense>
  );
}
