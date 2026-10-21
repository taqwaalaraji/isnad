import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { CreateNewsroom, NewsroomMenu } from "@/features/console/newsrooms/newsroom-dialogs";
import { listNewsrooms } from "@/features/console/queries";
import { requireStaff } from "@/lib/auth";
import { formatCost, formatNumber } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

async function Content({ locale }: { locale: Locale }) {
  const [viewer, t] = await Promise.all([requireStaff(locale), getT(locale)]);
  const rooms = await listNewsrooms();
  const isAdmin = viewer.platformRole === "admin";
  const members = rooms.reduce((sum, r) => sum + r.members, 0);
  const n = (value: number) => formatNumber(value, locale);

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("console.newsrooms.title") }]} />
      <PageHeader
        title={t("console.newsrooms.title")}
        subtitle={t("console.newsrooms.subtitle", { count: rooms.length, members })}
        actions={isAdmin ? <CreateNewsroom /> : <span className="text-xs text-muted">{t("console.adminOnly")}</span>}
      />
      <Card>
        {rooms.length === 0 ? (
          <EmptyState icon={<Icon name="newsroom" size={32} />} title={t("console.newsrooms.title")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-sunken/50 text-xs text-muted">
                  <th className="px-5 py-3 text-start font-medium">{t("console.newsrooms.name")}</th>
                  <th className="px-3 py-3 text-start font-medium">{t("console.newsrooms.admin")}</th>
                  <th className="px-3 py-3 text-end font-medium">{t("console.newsrooms.members")}</th>
                  <th className="px-3 py-3 text-end font-medium">{t("console.newsrooms.checksThisMonth")}</th>
                  <th className="px-3 py-3 text-end font-medium">{t("console.newsrooms.mediaMinutes")}</th>
                  <th className="px-3 py-3 text-end font-medium">{t("console.newsrooms.cost")}</th>
                  <th className="px-3 py-3 text-start font-medium">{t("console.newsrooms.statusLabel")}</th>
                  {isAdmin && <th className="w-12 px-3 py-3" />}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => {
                  const overLimit = room.monthly_check_limit !== null && room.checksThisMonth >= room.monthly_check_limit;
                  return (
                    <tr key={room.id} className="border-b border-border last:border-0 hover:bg-surface-sunken/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-on-accent">
                            {room.name.trim().charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{room.name}</p>
                            <p className="truncate text-xs text-muted">
                              {t(`console.newsrooms.kinds.${room.kind}`)} · <span dir="ltr">{room.slug}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {room.admin ? (
                          <span className="block max-w-[200px] truncate">{room.admin.full_name || room.admin.email}</span>
                        ) : room.invitedAdmin ? (
                          <span className="block max-w-[200px] truncate text-xs text-muted" dir="auto">
                            {t("console.newsrooms.invited", { email: room.invitedAdmin })}
                          </span>
                        ) : (
                          <span className="text-xs text-subtle">{t("console.newsrooms.noAdmin")}</span>
                        )}
                      </td>
                      <td className="num px-3 py-3 text-end">{n(room.members)}</td>
                      <td className={cn("num px-3 py-3 text-end", overLimit && "font-semibold text-differ-text")}>
                        {n(room.checksThisMonth)}
                        <span className="text-xs text-muted"> / {room.monthly_check_limit ? n(room.monthly_check_limit) : "∞"}</span>
                      </td>
                      <td className="num px-3 py-3 text-end">{n(room.mediaMinutes)}</td>
                      <td className="num px-3 py-3 text-end">{formatCost(room.costThisMonth, locale)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-medium",
                            room.status === "active" ? "bg-accent-soft text-accent" : "bg-differ-tint text-differ-text",
                          )}
                        >
                          {t(`console.newsrooms.status.${room.status === "suspended" ? "suspended" : "active"}`)}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-3">
                          <NewsroomMenu room={room} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="mt-4 flex items-start gap-3 rounded-md bg-surface-sunken px-4 py-3 text-sm text-muted">
        <Icon name="info" size={16} className="mt-0.5 shrink-0" />
        <p>{t("console.newsrooms.issuerNote")}</p>
      </div>
    </>
  );
}

export default async function NewsroomsPage({ params }: PageProps<"/[locale]/console/newsrooms">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-lg" />}>
      <Content locale={locale} />
    </Suspense>
  );
}
