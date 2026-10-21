import Link from "next/link";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, Metric, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { CheckTable } from "@/features/checks/check-table";
import { homeData } from "@/features/checks/queries";
import { DropZone } from "@/features/home/drop-zone";
import { requireNewsroom } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { AlertKind } from "@/lib/types";

const ALERT_ICON: Record<AlertKind, IconName> = {
  figure_revised: "refresh",
  new_release: "file",
  new_figure: "chart",
  review_requested: "review",
  check_ready: "check",
  check_escalated: "flag",
};

type AlertPayload = { check_id?: string; claim_id?: string; affected_checks?: string[] };

function alertHref(locale: Locale, payload: AlertPayload | null): string {
  const checkId = payload?.check_id ?? payload?.affected_checks?.[0];
  if (!checkId) return `/${locale}/alerts`;
  return `/${locale}/checks/${checkId}${payload?.claim_id ? `?claim=${payload.claim_id}` : ""}`;
}

function oldestAge(rows: Array<{ created_at: string }>, locale: Locale): string | null {
  const oldest = rows.reduce<string | null>((min, r) => (!min || r.created_at < min ? r.created_at : min), null);
  return oldest ? formatRelative(oldest, locale) : null;
}

async function Home({ locale }: { locale: Locale }) {
  const [viewer, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  const data = await homeData(viewer);
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hour12: false, timeZone: "Asia/Dubai" }).format(new Date()));
  const firstName = viewer.fullName.split(" ")[0];
  const delta = data.thisWeek - data.lastWeek;
  const unreadAlerts = data.alerts.filter((a) => !a.read_at).length;
  const processing = data.processing[0];
  const progress = (processing?.progress ?? {}) as { claims_total?: number; claims_checked?: number };
  const oldest = oldestAge(data.awaiting, locale);

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("nav.home") }]} />
      <PageHeader
        title={hour < 12 ? t("home.greetingMorning", { name: firstName }) : t("home.greetingEvening", { name: firstName })}
        subtitle={t("home.summary", { review: data.awaiting.length, alerts: unreadAlerts })}
        actions={
          <ButtonLink href={`/${locale}/registry`} icon="registry">
            {t("home.openRegistry")}
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <DropZone />
        <div className="grid grid-cols-2 gap-4">
          <Metric
            label={t("home.thisWeek")}
            icon={<Icon name="checks" size={16} />}
            value={data.thisWeek}
            detail={
              delta > 0
                ? t("home.thisWeekDelta", { n: delta })
                : delta < 0
                  ? t("home.thisWeekDeltaLess", { n: -delta })
                  : t("home.thisWeekSame")
            }
          />
          <Metric
            label={t("home.numbersChecked")}
            icon={<Icon name="link" size={16} />}
            value={data.numbersChecked}
            detail={t("home.numbersConnected", { n: data.numbersConnected })}
          />
          <Metric
            label={t("home.awaitingReview")}
            icon={<Icon name="clock" size={16} />}
            value={data.awaiting.length}
            detail={oldest ? t("home.awaitingOldest", { age: oldest }) : t("home.emptyAwaiting")}
          />
          <Metric
            label={t("home.processing")}
            icon={<Icon name="refresh" size={16} />}
            value={data.processing.length}
            detail={
              processing ? (
                <Link href={`/${locale}/checks/${processing.id}`} className="block space-y-1.5 hover:text-text">
                  <span className="block truncate">{processing.title}</span>
                  {progress.claims_total ? (
                    <ProgressBar value={Math.round(((progress.claims_checked ?? 0) / progress.claims_total) * 100)} label={processing.title} />
                  ) : (
                    <span className="block">{t(`stage.${processing.stage}`)}</span>
                  )}
                </Link>
              ) : (
                t("home.nothingProcessing")
              )
            }
          />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {t("home.awaitingTitle")}
              {data.awaiting.length > 0 && <span className="num rounded-full bg-accent px-1.5 text-[11px] text-on-accent">{data.awaiting.length}</span>}
            </span>
          }
          action={
            <Link href={`/${locale}/checks?filter=awaitingMe`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              <Icon name="external" size={14} />
              {t("common.viewAll")}
            </Link>
          }
        />
        {data.awaiting.length > 0 ? (
          <CheckTable rows={data.awaiting.slice(0, 5)} t={t} locale={locale} />
        ) : data.recent.length > 0 ? (
          <>
            <p className="px-5 pb-2 text-sm text-muted">{t("home.emptyAwaiting")}</p>
            <h3 className="px-5 pt-2 text-xs font-medium text-muted">{t("home.recentTitle")}</h3>
            <CheckTable rows={data.recent.slice(0, 5)} t={t} locale={locale} />
          </>
        ) : (
          <EmptyState icon={<Icon name="checks" size={32} />} title={t("home.emptyRecent")} />
        )}
      </Card>

      {data.alerts.length > 0 && (
        <section className="mt-6 grid gap-4 md:grid-cols-2" aria-label={t("home.alertsTitle")}>
          {data.alerts.map((alert) => (
            <Link key={alert.id} href={alertHref(locale, alert.payload as AlertPayload | null)} className="group">
              <Card className="flex h-full gap-3 p-4 transition-colors group-hover:border-border-strong">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <Icon name={ALERT_ICON[alert.kind]} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{alert.title}</p>
                    <span className="shrink-0 text-xs text-subtle">{formatRelative(alert.created_at, locale)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{alert.body ?? t(`alerts.kinds.${alert.kind}`)}</p>
                </div>
              </Card>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home locale={locale} />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[220px] rounded-lg" />
        <Skeleton className="h-[220px] rounded-lg" />
      </div>
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}
