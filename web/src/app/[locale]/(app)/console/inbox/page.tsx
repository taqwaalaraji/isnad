import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Card, EmptyState, Metric, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Pagination } from "@/components/ui/pagination";
import { FilterChips, listHref } from "@/features/console/filter-chips";
import { InboxTable } from "@/features/console/inbox/inbox-table";
import { InboxUpload } from "@/features/console/inbox/upload-dialog";
import { LiveRefresh } from "@/features/console/live-refresh";
import { CONSOLE_PAGE_SIZE, INBOX_FILTERS, type InboxFilter, inboxMetrics, listInbox, sourceOptions } from "@/features/console/queries";
import { requireStaff } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/console/inbox">;

async function Content({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const [, t, params] = await Promise.all([requireStaff(locale), getT(locale), searchParams]);
  const filter = (INBOX_FILTERS.includes(params.filter as InboxFilter) ? params.filter : "all") as InboxFilter;
  const page = Math.max(1, Number(params.page) || 1);
  const [{ rows, total }, metrics, sources] = await Promise.all([listInbox({ filter, page }), inboxMetrics(), sourceOptions()]);
  const base = `/${locale}/console/inbox`;
  const current = { filter: filter === "all" ? undefined : filter };
  const n = (value: number) => formatNumber(value, locale);

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("console.inbox.title") }]} />
      <LiveRefresh tables={["document_versions"]} channel="inbox" />
      <PageHeader title={t("console.inbox.title")} subtitle={t("console.inbox.subtitle")} actions={<InboxUpload sources={sources} compact />} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={t("console.inbox.metrics.pending")}
          value={n(metrics.pending)}
          detail={t("console.inbox.metrics.pendingDetail", { n: metrics.pendingFiles })}
          icon={<Icon name="review" size={18} />}
        />
        <Metric
          label={t("console.inbox.metrics.extracting")}
          value={n(metrics.extracting)}
          detail={metrics.extractingTitle ?? "—"}
          icon={<Icon name="refresh" size={18} />}
        />
        <Metric
          label={t("console.inbox.metrics.approvedWeek")}
          value={n(metrics.approvedWeek)}
          detail={t("console.inbox.metrics.approvedWeekDetail", { n: metrics.approvedWeekFiles })}
          icon={<Icon name="check" size={18} />}
        />
        <Metric
          label={t("console.inbox.metrics.failed")}
          value={n(metrics.failed)}
          detail={t("console.inbox.metrics.failedDetail")}
          icon={<Icon name="alert" size={18} />}
        />
      </div>
      <InboxUpload sources={sources} />
      <div className="mb-4">
        <FilterChips
          label={t("common.filter")}
          active={filter}
          hrefFor={(value) => listHref(base, current, { filter: value === "all" ? undefined : value, page: undefined })}
          items={INBOX_FILTERS.map((value) => ({ value, label: t(`console.inbox.filters.${value}`) }))}
        />
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Icon name="inbox" size={32} />} title={t("console.inbox.empty")} />
        ) : (
          <>
            <InboxTable rows={rows} t={t} locale={locale} />
            {filter !== "review" && (
              <Pagination
                page={page}
                total={total}
                pageSize={CONSOLE_PAGE_SIZE}
                hrefFor={(p) => listHref(base, current, { page: p === 1 ? undefined : p })}
                summary={t("common.showing", { from: (page - 1) * CONSOLE_PAGE_SIZE + 1, to: Math.min(page * CONSOLE_PAGE_SIZE, total), total })}
              />
            )}
          </>
        )}
      </Card>
    </>
  );
}

export default async function InboxPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-9 w-56" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      }
    >
      <Content locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
