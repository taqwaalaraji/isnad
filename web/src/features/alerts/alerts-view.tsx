"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { formatDate, formatRelative } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { subscribeAsUser } from "@/lib/supabase/realtime";

import { dismissAlerts, markAlertsRead, setFollow } from "./actions";
import { ALERT_FILTERS, type AlertFilter, type AlertKind, alertHref } from "./groups";
import type { AlertItem, AlertsPageData } from "./queries";

const KIND_ICON: Record<AlertKind, IconName> = {
  figure_revised: "refresh",
  new_release: "file",
  new_figure: "chart",
  review_requested: "flag",
  check_ready: "circle-check",
  check_escalated: "flag",
};

/** Refresh the page when this newsroom's alerts change (RLS limits events to the viewer's own). */
function useAlertsRealtime(newsroomId: string) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeAsUser(`alerts:${newsroomId}`, (channel) =>
      channel.on("postgres_changes", { event: "*", schema: "public", table: "alerts", filter: `newsroom_id=eq.${newsroomId}` }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 500);
      }),
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [newsroomId, router]);
}

function dayBucket(iso: string, now: number): "today" | "week" | "earlier" {
  const date = new Date(iso);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (date >= today) return "today";
  if (now - date.getTime() < 7 * 86_400_000) return "week";
  return "earlier";
}

export function AlertsView({ data, filter, newsroomId }: { data: AlertsPageData; filter: AlertFilter; newsroomId: string }) {
  const { t, locale } = useI18n();
  const [now] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  useAlertsRealtime(newsroomId);

  const groups = (["today", "week", "earlier"] as const)
    .map((bucket) => ({ bucket, items: data.alerts.filter((a) => dayBucket(a.created_at, now) === bucket) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-2" aria-label={t("common.filter")}>
            {ALERT_FILTERS.map((f) => (
              <Link
                key={f}
                href={f === "all" ? `/${locale}/alerts` : `/${locale}/alerts?filter=${f}`}
                aria-current={filter === f ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  filter === f ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-border bg-surface hover:border-border-strong",
                )}
              >
                {t(`alerts.filters.${f}`)}
                <span className={cn("num rounded-full px-1.5 text-xs", filter === f ? "bg-white/15" : "bg-surface-sunken text-muted")}>{data.counts[f]}</span>
              </Link>
            ))}
          </nav>
          <div className="flex gap-2">
            <ButtonLink href={`/${locale}/settings?tab=notifications`} size="sm" icon="settings">
              {t("alerts.settings")}
            </ButtonLink>
            <Button
              size="sm"
              icon="check"
              loading={pending}
              disabled={data.counts.unread === 0}
              onClick={() =>
                startTransition(async () => {
                  const res = await markAlertsRead();
                  if (res.ok) toast.success(t("alerts.allRead"));
                  else toast.error(t(res.error));
                })
              }
            >
              {t("alerts.markAllRead")}
            </Button>
          </div>
        </div>

        {groups.length === 0 ? (
          <Card>
            <EmptyState icon={<Icon name="bell" size={28} />} title={filter === "all" ? t("alerts.empty") : t("alerts.emptyFiltered")} body={t("alerts.emptyBody")} />
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.bucket}>
                <h2 className="mb-2 text-xs font-medium text-muted">{t(`alerts.buckets.${group.bucket}`)}</h2>
                <ul className="space-y-3">
                  {group.items.map((alert) => (
                    <AlertCard key={alert.id} alert={alert} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <FollowsCard follows={data.follows} />
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Icon name="bell" size={16} className="text-muted" />
            {t("alerts.delivery")}
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              {t("settings.notify.inApp")}
              <Icon name="check" size={16} className="text-match-text" />
            </li>
            <li className="flex items-center justify-between">
              {t("settings.notify.telegramChannel")}
              {data.delivery.telegram ? <Icon name="check" size={16} className="text-match-text" /> : <span className="text-xs text-muted">{t("alerts.off")}</span>}
            </li>
          </ul>
          <Link href={`/${locale}/settings?tab=notifications`} className="mt-3 inline-block text-xs font-medium text-accent hover:underline">
            {t("alerts.manageDelivery")}
          </Link>
        </Card>
      </aside>
    </div>
  );
}

function AlertCard({ alert }: { alert: AlertItem }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unread = !alert.read_at;
  const href = alertHref(alert.kind, alert.payload, locale);
  const affected = Array.isArray(alert.payload.affected_checks) ? (alert.payload.affected_checks as string[]) : [];
  const issue = alert.kind === "figure_revised" || alert.kind === "check_escalated";

  function open(target: string) {
    if (unread) void markAlertsRead([alert.id]);
    router.push(target);
  }

  return (
    <li>
      <Card className={cn("flex gap-3 p-4 transition-colors", unread && "border-accent/40")}>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md",
            issue ? "bg-context-tint text-context-text" : alert.kind === "check_ready" ? "bg-match-tint text-match-text" : "bg-surface-sunken text-muted",
          )}
        >
          <Icon name={KIND_ICON[alert.kind]} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>
              {unread && <span className="me-1.5 inline-block size-2 rounded-full bg-accent align-middle" aria-label={t("alerts.unread")} />}
              {t(`alerts.headline.${alert.kind}`, { title: alert.title })}
            </p>
            <time className="num shrink-0 text-xs text-muted" dateTime={alert.created_at} title={formatDate(alert.created_at, locale, "datetime")}>
              {formatRelative(alert.created_at, locale)}
            </time>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {[
              t(`alerts.kinds.${alert.kind}`),
              alert.body,
              typeof alert.payload.source === "string" ? alert.payload.source : null,
              affected.length ? t("alerts.affects", { n: affected.length }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {affected.length > 0 && (
              <Button size="sm" variant="primary" icon="edit" onClick={() => open(`/${locale}/checks/${affected[0]}`)}>
                {affected.length > 1 ? t("alerts.viewAffected") : t("alerts.openAffected")}
              </Button>
            )}
            {href && (
              <Button size="sm" variant={affected.length ? "secondary" : "primary"} iconEnd="chevron-right" onClick={() => open(href)}>
                {t(`alerts.actions.${alert.kind}`)}
              </Button>
            )}
            {unread && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => void (await markAlertsRead([alert.id])))}>
                {t("alerts.markRead")}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await dismissAlerts([alert.id]);
                  if (!res.ok) toast.error(t(res.error));
                })
              }
            >
              {t("alerts.dismiss")}
            </Button>
          </div>
          {affected.length > 1 && (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {affected.slice(0, 8).map((id, i) => (
                <li key={id}>
                  <Link href={`/${locale}/checks/${id}`} className="text-accent hover:underline" onClick={() => unread && void markAlertsRead([alert.id])}>
                    {t("alerts.affectedItem", { n: i + 1 })}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </li>
  );
}

function FollowsCard({ follows }: { follows: AlertsPageData["follows"] }) {
  const { t, locale } = useI18n();
  const [state, setState] = useState(() => new Map(follows.map((f) => [f.id, true])));
  const [, startTransition] = useTransition();

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {t("alerts.following")} <span className="num text-xs font-normal text-muted">({follows.length})</span>
        </h2>
        <Link href={`/${locale}/registry`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          <Icon name="plus" size={12} />
          {t("alerts.followMore")}
        </Link>
      </div>
      {follows.length === 0 ? (
        <p className="text-xs text-muted">{t("alerts.noFollows")}</p>
      ) : (
        <ul className="space-y-3">
          {follows.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3">
              <Link href={`/${locale}/registry/${f.type === "indicator" ? "indicators" : "entities"}/${f.id}`} className="min-w-0 hover:underline">
                <p className="truncate text-sm font-medium">{locale === "ar" ? f.name_ar : f.name_en}</p>
                <p className="text-xs text-muted">{t(`alerts.followTypes.${f.type}`)}</p>
              </Link>
              <Switch
                label={locale === "ar" ? f.name_ar : f.name_en}
                checked={state.get(f.id) ?? false}
                onCheckedChange={(on) => {
                  setState((prev) => new Map(prev).set(f.id, on));
                  startTransition(async () => {
                    const res = await setFollow({ type: f.type, id: f.id, on });
                    if (!res.ok) {
                      setState((prev) => new Map(prev).set(f.id, !on));
                      toast.error(t(res.error));
                    }
                  });
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
