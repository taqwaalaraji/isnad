import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, Metric } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { formatDate, formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translate";

import { ActivityFilter } from "./activity-filter";
import { actionLabel } from "./activity-labels";
import type { ActivityRow, NewsroomStats } from "./queries";

function changePct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function ActivityView({
  locale,
  t,
  stats,
  feed,
  hasMore,
  members,
  userId,
  base,
}: {
  locale: Locale;
  t: Translate;
  stats: NewsroomStats;
  feed: ActivityRow[];
  hasMore: boolean;
  members: Array<{ id: string; name: string }>;
  userId?: string;
  base: string;
}) {
  const change = changePct(stats.checks_this_month, stats.checks_last_month);
  const connectedPct = stats.claims_this_month ? Math.round((stats.claims_connected / stats.claims_this_month) * 100) : 0;
  const max = Math.max(1, ...stats.daily.map((d) => d.n));
  const kinds = Object.entries(stats.by_kind).sort((a, b) => b[1] - a[1]);
  const totalKinds = kinds.reduce((sum, [, n]) => sum + n, 0);
  const limit = stats.monthly_check_limit;
  const last = feed.at(-1);
  const olderHref = last ? `${base}?${new URLSearchParams({ ...(userId ? { user: userId } : {}), before: last.at }).toString()}` : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={t("admin.activity.checksThisMonth")}
          icon={<Icon name="checks" size={16} />}
          value={formatNumber(stats.checks_this_month, locale)}
          detail={change === null ? t("admin.activity.noLastMonth") : t("admin.activity.vsLastMonth", { pct: `${change > 0 ? "+" : ""}${change}%` })}
        />
        <Metric
          label={t("admin.activity.minutesProcessed")}
          icon={<Icon name="video" size={16} />}
          value={formatNumber(stats.media_minutes, locale)}
          detail={t("admin.activity.mediaOnly")}
        />
        <Metric
          label={t("admin.activity.claimsThisMonth")}
          icon={<Icon name="link" size={16} />}
          value={formatNumber(stats.claims_this_month, locale)}
          detail={t("admin.activity.connectedPct", { pct: `${connectedPct}%` })}
        />
        <Metric
          label={t("admin.activity.avgReview")}
          icon={<Icon name="clock" size={16} />}
          value={stats.avg_review_hours === null ? "—" : t("admin.activity.hours", { n: formatNumber(stats.avg_review_hours, locale, 1) })}
          detail={t("admin.activity.awaitingNow", { n: formatNumber(stats.awaiting_review, locale) })}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("admin.activity.daily")} />
            <div className="px-5 pb-4">
              <div className="flex h-36 items-end gap-1.5" role="img" aria-label={t("admin.activity.daily")}>
                {stats.daily.map((d, i) => (
                  <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${formatDate(d.day, locale)}: ${d.n}`}>
                    <div
                      className={cn("rounded-t-xs", i === stats.daily.length - 1 ? "bg-accent" : "bg-accent-soft", d.n === 0 && "bg-surface-sunken")}
                      style={{ height: `${Math.max(4, (d.n / max) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="num mt-2 flex justify-between text-[11px] text-muted">
                <span>{formatDate(stats.daily[0]?.day, locale, "short")}</span>
                <span>{formatDate(stats.daily.at(-1)?.day, locale, "short")}</span>
              </div>
              {kinds.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                  {kinds.map(([kind, n]) => (
                    <li key={kind} className="flex justify-between">
                      <span className="text-muted">{t(`inputKind.${kind as "video"}`)}</span>
                      <span className="num font-medium">{Math.round((n / totalKinds) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">{t("admin.activity.usageTitle")}</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t("admin.activity.costThisMonth")}</dt>
                <dd className="num font-semibold" dir="ltr">
                  ${formatNumber(stats.cost_usd, "en", 2)}
                </dd>
              </div>
              <div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t("admin.activity.limit")}</dt>
                  <dd className="num font-medium">
                    {limit ? `${formatNumber(stats.checks_this_month, locale)} / ${formatNumber(limit, locale)}` : t("admin.activity.noLimit")}
                  </dd>
                </div>
                {limit ? <ProgressBar className="mt-2" value={Math.min(100, (stats.checks_this_month / limit) * 100)} label={t("admin.activity.limit")} /> : null}
              </div>
            </dl>
          </Card>
        </div>

        <Card>
          <CardHeader
            title={t("admin.activity.log")}
            action={<ActivityFilter members={members} userId={userId} label={t("admin.activity.who")} allLabel={t("admin.activity.everyone")} />}
          />
          {feed.length === 0 ? (
            <EmptyState icon={<Icon name="activity" size={28} />} title={t("admin.activity.empty")} />
          ) : (
            <ol className="px-5 pb-2">
              {feed.map((row, i) => (
                <li key={`${row.at}-${i}`} className="flex items-start gap-3 border-t border-border py-3 first:border-t-0">
                  <Avatar name={row.user_name ?? "?"} size={28} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p>
                      <span className="font-medium">{row.user_name ?? t("admin.activity.system")}</span>{" "}
                      <span className="text-muted">{actionLabel(row.action, t)}</span>
                      {row.target_title && (
                        <>
                          {" "}
                          {row.target_type === "check" && row.target_id ? (
                            <Link href={`/${locale}/checks/${row.target_id}`} className="font-medium text-accent hover:underline">
                              «{row.target_title}»
                            </Link>
                          ) : (
                            <span className="font-medium">«{row.target_title}»</span>
                          )}
                        </>
                      )}
                    </p>
                    {typeof (row.details as { email?: string })?.email === "string" && (
                      <p className="text-xs text-muted" dir="ltr">
                        {(row.details as { email: string }).email}
                      </p>
                    )}
                    {typeof (row.details as { note?: string })?.note === "string" && (row.details as { note: string }).note !== "approve_matches" && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{(row.details as { note: string }).note}</p>
                    )}
                  </div>
                  <time className="num shrink-0 text-xs text-muted" dateTime={row.at}>
                    {formatDate(row.at, locale, "datetime")}
                  </time>
                </li>
              ))}
            </ol>
          )}
          {(hasMore || feed.length > 0) && (
            <div className="flex justify-between gap-2 border-t border-border px-5 py-3">
              <ButtonLink href={userId ? `${base}?user=${userId}` : base} size="sm" variant="ghost">
                {t("admin.activity.latest")}
              </ButtonLink>
              {hasMore && olderHref && (
                <ButtonLink href={olderHref} size="sm" iconEnd="chevron-right">
                  {t("admin.activity.older")}
                </ButtonLink>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
