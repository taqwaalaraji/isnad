import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState, Metric, PageHeader, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { VerdictBadge } from "@/features/checks/badges";
import { LiveRefresh } from "@/features/console/live-refresh";
import { percent, readMetrics, runLabel, VERDICT_KEYS } from "@/features/console/quality/metrics";
import { EditModelSetting, RunEvalButton } from "@/features/console/quality/quality-controls";
import { evalRuns, modelSettings, usageSummary } from "@/features/console/queries";
import { requireStaff } from "@/lib/auth";
import { formatCost, formatDate, formatNumber, formatRelative } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";

const BAR: Record<string, string> = { match: "bg-match", differs: "bg-differ", context: "bg-context", none: "bg-none" };

async function Content({ locale }: { locale: Locale }) {
  const [viewer, t] = await Promise.all([requireStaff(locale), getT(locale)]);
  const [settings, runs, { usage, checkCosts }] = await Promise.all([modelSettings(), evalRuns(), usageSummary(30)]);
  const isAdmin = viewer.platformRole === "admin";
  const running = runs.some((r) => r.status === "queued" || r.status === "running");
  const latest = runs.find((r) => r.status === "done");
  const metrics = latest ? readMetrics(latest.metrics) : null;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  const month = monthStart.toISOString().slice(0, 7);
  const costByTask = new Map<string, number>();
  for (const row of usage) if (String(row.day).startsWith(month)) costByTask.set(row.task, (costByTask.get(row.task) ?? 0) + Number(row.cost));
  const checks = checkCosts.reduce((sum, c) => sum + c.checks, 0);
  const avgCheckCost = checks ? checkCosts.reduce((sum, c) => sum + Number(c.avg_cost) * c.checks, 0) / checks : null;
  const taskName = (task: string) => t(`console.quality.tasks.${task}` as MessageKey);
  const knownTask = (task: string) => taskName(task) !== `console.quality.tasks.${task}`;

  // Daily totals for the usage table (most recent first).
  const days = new Map<string, { cost: number; calls: number }>();
  for (const row of usage) {
    const key = String(row.day);
    const day = days.get(key) ?? { cost: 0, calls: 0 };
    day.cost += Number(row.cost);
    day.calls += row.events;
    days.set(key, day);
  }

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("console.quality.title") }]} />
      <LiveRefresh tables={["eval_runs"]} channel="quality" />
      <PageHeader title={t("console.quality.title")} subtitle={t("console.quality.subtitle")} actions={<RunEvalButton running={running} />} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={t("console.quality.accuracy")}
          value={percent(metrics?.accuracy ?? null)}
          detail={metrics?.total ? t("console.quality.accuracyDetail", { n: metrics.total }) : t("console.quality.noRuns")}
          icon={<Icon name="gauge" size={18} />}
        />
        <Metric
          label={t("console.quality.abstention")}
          value={metrics?.abstention ? `${metrics.abstention.correct}/${metrics.abstention.total}` : "—"}
          detail={t("console.quality.abstentionDetail")}
          icon={<Icon name="shield" size={18} />}
        />
        <Metric
          label={t("console.quality.evidenceVerified")}
          value={percent(metrics?.evidenceVerified ?? null)}
          detail={t("console.quality.evidenceVerifiedDetail")}
          icon={<Icon name="check" size={18} />}
        />
        <Metric
          label={t("console.quality.checkCost")}
          value={avgCheckCost === null ? "—" : formatCost(avgCheckCost, locale)}
          detail={t("console.quality.checkCostDetail")}
          icon={<Icon name="chart" size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader title={t("console.quality.runs")} description={latest ? t("console.quality.latestRun", { date: formatDate(latest.created_at, locale) }) : undefined} />
          {runs.length === 0 ? (
            <EmptyState icon={<Icon name="gauge" size={28} />} title={t("console.quality.noRuns")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-y border-border text-xs text-muted">
                    <th className="px-5 py-2.5 text-start font-medium">{t("console.quality.config")}</th>
                    <th className="px-3 py-2.5 text-end font-medium">{t("console.quality.accuracy")}</th>
                    <th className="px-3 py-2.5 text-end font-medium">{t("console.quality.abstention")}</th>
                    <th className="px-3 py-2.5 text-end font-medium">{t("console.quality.cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const m = readMetrics(run.metrics);
                    const active = run.status === "queued" || run.status === "running";
                    const settingsJson = (run.settings ?? {}) as { discovery?: boolean };
                    return (
                      <tr key={run.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3">
                          <p className="num font-medium" dir="ltr">
                            {runLabel(run.settings, run.dataset)}
                          </p>
                          <p className="text-xs text-muted">
                            {[
                              formatRelative(run.created_at, locale),
                              run.starter?.full_name,
                              settingsJson.discovery === undefined ? null : settingsJson.discovery ? t("console.quality.discoveryOn") : t("console.quality.discoveryOff"),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {run.status === "failed" && run.error && <p className="mt-1 truncate text-xs text-differ-text">{run.error}</p>}
                        </td>
                        {active ? (
                          <td colSpan={3} className="px-3 py-3 text-end">
                            <Badge tone="accent" icon="refresh" size="sm">
                              {m.progress ? t("console.quality.runProgress", { done: m.progress.done, total: m.progress.total }) : t(`console.quality.runStatus.${run.status}` as MessageKey)}
                            </Badge>
                          </td>
                        ) : run.status === "failed" ? (
                          <td colSpan={3} className="px-3 py-3 text-end">
                            <Badge tone="differs" size="sm">
                              {t("console.quality.runStatus.failed")}
                            </Badge>
                          </td>
                        ) : (
                          <>
                            <td className="num px-3 py-3 text-end font-semibold">{percent(m.accuracy)}</td>
                            <td className="num px-3 py-3 text-end">{m.abstention ? `${m.abstention.correct}/${m.abstention.total}` : "—"}</td>
                            <td className="num px-3 py-3 text-end">{m.cost === null ? "—" : formatCost(m.cost, locale)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {metrics && Object.keys(metrics.byVerdict).length > 0 && (
            <div className="space-y-2.5 border-t border-border px-5 py-4">
              <h3 className="text-sm font-semibold">{t("console.quality.byVerdict")}</h3>
              {VERDICT_KEYS.filter((v) => metrics.byVerdict[v] !== undefined).map((v) => (
                <div key={v} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <VerdictBadge verdict={v} t={t} short size="sm" />
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <div className={cn("h-full rounded-full", BAR[v])} style={{ width: `${Math.round((metrics.byVerdict[v] ?? 0) * 100)}%` }} />
                  </div>
                  <span className="num w-12 shrink-0 text-end text-xs text-muted">{percent(metrics.byVerdict[v] ?? null)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader title={t("console.quality.models")} description={isAdmin ? undefined : t("console.adminOnly")} />
          <ul className="divide-y divide-border border-t border-border">
            {settings.map((s) => (
              <li key={s.task} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{knownTask(s.task) ? taskName(s.task) : s.task}</p>
                    <p className="font-mono text-[11px] text-subtle" dir="ltr">
                      {s.task}
                    </p>
                  </div>
                  <span className="num w-16 shrink-0 text-end text-xs text-muted">{formatCost(costByTask.get(s.task) ?? 0, locale)}</span>
                  {isAdmin && <EditModelSetting setting={s} taskName={knownTask(s.task) ? taskName(s.task) : s.task} />}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5" dir="ltr">
                  <Badge tone="accent" size="sm">
                    {s.model}
                  </Badge>
                  {s.escalation_model && (
                    <Badge tone="outline" size="sm">
                      → {s.escalation_model}
                    </Badge>
                  )}
                  {s.task !== "transcribe" && (
                    <Badge tone="neutral" size="sm">
                      {s.effort}
                    </Badge>
                  )}
                  {s.max_tokens && (
                    <Badge tone="outline" size="sm">
                      {formatNumber(s.max_tokens, "en")} tok
                    </Badge>
                  )}
                  {!s.enabled && (
                    <Badge tone="differs" size="sm">
                      {t("console.quality.disabled")}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-5 py-3 text-xs text-muted">{t("console.quality.footnote")}</p>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title={t("console.quality.usageTitle")} />
        {days.size === 0 ? (
          <EmptyState icon={<Icon name="chart" size={28} />} title={t("console.quality.usageEmpty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-y border-border text-xs text-muted">
                  <th className="px-5 py-2.5 text-start font-medium">{t("fields.period")}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{t("console.quality.byTask")}</th>
                  <th className="px-3 py-2.5 text-end font-medium">{t("console.quality.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {[...days.entries()].slice(0, 14).map(([day, total]) => (
                  <tr key={day} className="border-b border-border last:border-0 align-top">
                    <td className="num px-5 py-3 whitespace-nowrap">{formatDate(day, locale)}</td>
                    <td className="px-3 py-3 text-xs text-muted">
                      {usage
                        .filter((u) => String(u.day) === day)
                        .map((u) => `${knownTask(u.task) ? taskName(u.task) : u.task} · ${t("console.quality.calls", { n: u.events })} · ${formatCost(Number(u.cost), locale)}`)
                        .join("  |  ")}
                    </td>
                    <td className="num px-3 py-3 text-end font-semibold">{formatCost(total.cost, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export default async function QualityPage({ params }: PageProps<"/[locale]/console/quality">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      }
    >
      <Content locale={locale} />
    </Suspense>
  );
}
