import { connection } from "next/server";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Card, CardHeader, EmptyState, Metric, PageHeader, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { jobOverview } from "@/features/console/queries";
import { JobAction } from "@/features/console/system/job-actions";
import { requireStaff } from "@/lib/auth";
import { formatNumber, formatRelative } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

const STATUSES = ["queued", "running", "failed", "done", "cancelled"] as const;
type JobStatus = (typeof STATUSES)[number];

async function Content({ locale }: { locale: Locale }) {
  const [, t] = await Promise.all([requireStaff(locale), getT(locale)]);
  await connection();
  const { stats, failures, lastActivity: lastAt, quiet, running, queued } = await jobOverview();
  const n = (value: number) => formatNumber(value, locale);

  const totals = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  const kinds = new Map<string, Record<JobStatus, number>>();
  for (const row of stats) {
    totals[row.status] += row.jobs;
    const entry = kinds.get(row.kind) ?? (Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>);
    entry[row.status] += row.jobs;
    kinds.set(row.kind, entry);
  }
  const oldestQueued = queued[0]?.created_at;

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("console.system.title") }]} />
      <PageHeader
        title={t("console.system.title")}
        subtitle={t("console.system.subtitle")}
        badge={
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", quiet ? "bg-surface-sunken text-muted" : "bg-match-tint text-match-text")}>
            <span className={cn("size-1.5 rounded-full", quiet ? "bg-subtle" : "bg-match")} />
            {quiet ? t("console.system.workerQuiet") : t("console.system.workerHealthy")}
          </span>
        }
      />
      <p className="-mt-4 mb-5 text-xs text-muted">{lastAt ? t("console.system.lastActivity", { when: formatRelative(lastAt, locale) }) : t("console.system.noActivity")}</p>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("console.system.queued")} value={n(totals.queued)} detail={oldestQueued ? t("console.system.oldest", { when: formatRelative(oldestQueued, locale) }) : undefined} icon={<Icon name="clock" size={18} />} />
        <Metric label={t("console.system.running")} value={n(totals.running)} icon={<Icon name="refresh" size={18} />} />
        <Metric label={t("console.system.failed")} value={n(totals.failed)} icon={<Icon name="alert" size={18} />} />
        <Metric label={t("console.system.done")} value={n(totals.done)} icon={<Icon name="check" size={18} />} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader title={t("console.system.jobs")} />
          {kinds.size === 0 ? (
            <EmptyState icon={<Icon name="system" size={28} />} title={t("console.system.noJobs")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-y border-border text-xs text-muted">
                    <th className="px-5 py-2.5 text-start font-medium">{t("console.system.kind")}</th>
                    {STATUSES.map((s) => (
                      <th key={s} className="px-3 py-2.5 text-end font-medium">
                        {t(`console.system.${s}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...kinds.entries()].map(([kind, counts]) => (
                    <tr key={kind} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5 font-mono text-xs" dir="ltr">
                        {kind}
                      </td>
                      {STATUSES.map((s) => (
                        <td key={s} className={cn("num px-3 py-2.5 text-end", !counts[s] && "text-subtle", s === "failed" && counts[s] > 0 && "font-semibold text-differ-text")}>
                          {n(counts[s])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title={t("console.system.runningNow")} />
            {running.length === 0 && queued.length === 0 ? (
              <p className="border-t border-border px-5 py-4 text-sm text-muted">—</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {running.map((job) => (
                  <li key={job.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <Icon name="refresh" size={14} className="animate-spin text-accent [animation-duration:2s]" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs" dir="ltr">
                      #{job.id} {job.kind}
                    </span>
                    <span className="text-xs text-muted">{job.started_at ? formatRelative(job.started_at, locale) : ""}</span>
                  </li>
                ))}
                {queued.map((job) => (
                  <li key={job.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <Icon name="clock" size={14} className="text-muted" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs" dir="ltr">
                      #{job.id} {job.kind}
                    </span>
                    <span className="text-xs text-muted">{formatRelative(job.created_at, locale)}</span>
                    <JobAction id={job.id} action="cancel" />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t("console.system.recentFailures")} />
            {failures.length === 0 ? (
              <p className="border-t border-border px-5 py-4 text-sm text-muted">{t("console.system.noFailures")}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {failures.map((job) => (
                  <li key={job.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs" dir="ltr">
                        #{job.id} {job.kind}
                        <span className="ms-2 text-muted">{job.status === "cancelled" ? t("console.system.cancelled") : t("console.system.attempts", { n: job.attempts, max: job.max_attempts })}</span>
                      </p>
                      {job.last_error && (
                        <p className="mt-1 line-clamp-2 text-xs break-all text-differ-text" dir="ltr" title={job.last_error}>
                          {job.last_error}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-subtle">{formatRelative(job.finished_at ?? job.created_at, locale)}</p>
                    </div>
                    <JobAction id={job.id} action="retry" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default async function SystemPage({ params }: PageProps<"/[locale]/console/system">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      }
    >
      <Content locale={locale} />
    </Suspense>
  );
}
