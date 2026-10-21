import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Pagination } from "@/components/ui/pagination";
import { ListSearch } from "@/features/checks/list-search";
import { FilterChips, listHref } from "@/features/console/filter-chips";
import { CONSOLE_PAGE_SIZE, listSources, SOURCE_FILTERS, type SourceFilter, sourceFilterCounts, sourceWarning } from "@/features/console/queries";
import { SourceTable } from "@/features/console/sources/source-table";
import { requireStaff } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/console/sources">;

async function Content({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const [, t, params] = await Promise.all([requireStaff(locale), getT(locale), searchParams]);
  const filter = (SOURCE_FILTERS.includes(params.filter as SourceFilter) ? params.filter : "all") as SourceFilter;
  const q = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, Number(params.page) || 1);
  const [{ rows, total }, counts, warning] = await Promise.all([listSources({ filter, q, page }), sourceFilterCounts(), sourceWarning()]);
  const base = `/${locale}/console/sources`;
  const current = { filter: filter === "all" ? undefined : filter, q: q || undefined };

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("console.sources.title") }]} />
      <PageHeader
        title={t("console.sources.title")}
        subtitle={t("console.sources.subtitle", { count: counts.all })}
        actions={
          <ButtonLink href={`${base}/new`} variant="primary" icon="plus">
            {t("console.sources.add")}
          </ButtonLink>
        }
      />
      {warning && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-md border border-border bg-surface-sunken px-4 py-3 text-sm">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-context-text" />
          <p>
            {t("console.sources.warning", {
              source: locale === "ar" ? warning.name_ar : warning.name_en,
              note: warning.health_note ?? t("console.sources.healthStates.warning"),
            })}
          </p>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          label={t("common.filter")}
          active={filter}
          hrefFor={(value) => listHref(base, current, { filter: value === "all" ? undefined : value, page: undefined })}
          items={SOURCE_FILTERS.map((value) => ({ value, label: t(`console.sources.filters.${value}`), count: counts[value] }))}
        />
        <ListSearch placeholder={t("console.sources.searchPlaceholder")} />
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Icon name="building" size={32} />} title={t("console.sources.empty")} />
        ) : (
          <>
            <SourceTable rows={rows} t={t} locale={locale} />
            <Pagination
              page={page}
              total={total}
              pageSize={CONSOLE_PAGE_SIZE}
              hrefFor={(p) => listHref(base, current, { page: p === 1 ? undefined : p })}
              summary={t("common.showing", { from: (page - 1) * CONSOLE_PAGE_SIZE + 1, to: Math.min(page * CONSOLE_PAGE_SIZE, total), total })}
            />
          </>
        )}
      </Card>
    </>
  );
}

export default async function SourcesPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-8 w-full max-w-xl" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
