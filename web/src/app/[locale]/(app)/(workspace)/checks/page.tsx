import Link from "next/link";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { Pagination } from "@/components/ui/pagination";
import { CheckTable } from "@/features/checks/check-table";
import { ListSearch } from "@/features/checks/list-search";
import { type CheckFilter, filterCounts, listChecks, PAGE_SIZE } from "@/features/checks/queries";
import { requireNewsroom } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

const FILTERS: CheckFilter[] = ["all", "mine", "awaitingMe", "approved", "published", "archived"];

async function Content({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/[locale]/checks">["searchParams"] }) {
  const [viewer, t, params] = await Promise.all([requireNewsroom(locale), getT(locale), searchParams]);
  const filter = (FILTERS.includes(params.filter as CheckFilter) ? params.filter : "all") as CheckFilter;
  const q = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, Number(params.page) || 1);
  const [{ rows, total }, counts] = await Promise.all([listChecks(viewer, { filter, q, page }), filterCounts(viewer)]);
  const base = `/${locale}/checks`;
  const href = (next: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    const merged = { filter: filter === "all" ? undefined : filter, q: q || undefined, ...next };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") search.set(k, String(v));
    const s = search.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("nav.checks") }]} />
      <PageHeader
        title={t("checks.title")}
        subtitle={t("checks.subtitle", { newsroom: viewer.active.newsroomName, count: counts.all })}
        actions={
          <ButtonLink href={`${base}/new`} variant="primary" icon="plus">
            {t("common.newCheck")}
          </ButtonLink>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const count = f in counts ? counts[f as keyof typeof counts] : undefined;
            const active = f === filter;
            return (
              <Link
                key={f}
                href={href({ filter: f === "all" ? undefined : f, page: undefined })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-border bg-surface text-text hover:border-border-strong",
                )}
              >
                {t(`checks.filters.${f}`)}
                {count !== undefined && <span className={cn("num rounded-full px-1.5 text-xs", active ? "bg-white/15" : "bg-surface-sunken text-muted")}>{count}</span>}
              </Link>
            );
          })}
        </nav>
        <ListSearch placeholder={t("checks.searchPlaceholder")} />
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="checks" size={32} />}
            title={q ? t("checks.emptyFiltered") : t("checks.empty")}
            action={
              !q && (
                <ButtonLink href={`${base}/new`} variant="primary" icon="plus">
                  {t("common.newCheck")}
                </ButtonLink>
              )
            }
          />
        ) : (
          <>
            <CheckTable rows={rows} t={t} locale={locale} />
            <Pagination
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              hrefFor={(p) => href({ page: p === 1 ? undefined : p })}
              summary={t("common.showing", { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, total), total })}
            />
          </>
        )}
      </Card>
    </>
  );
}

export default async function ChecksPage({ params, searchParams }: PageProps<"/[locale]/checks">) {
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
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-8 w-full max-w-xl" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
