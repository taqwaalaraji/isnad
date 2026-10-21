import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Skeleton } from "@/components/ui/card";
import { CatalogView } from "@/features/console/catalog/catalog-view";
import { catalogCounts, catalogOptions, listEntities, listIndicators } from "@/features/console/queries";
import { requireStaff } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/console/catalog">;

async function Content({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const [, t, params] = await Promise.all([requireStaff(locale), getT(locale), searchParams]);
  const kind = params.kind === "entities" ? "entities" : "indicators";
  const q = typeof params.q === "string" ? params.q : "";
  const [indicators, entities, counts, options] = await Promise.all([
    kind === "indicators" ? listIndicators(q) : [],
    kind === "entities" ? listEntities(q) : [],
    catalogCounts(),
    catalogOptions(),
  ]);
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("console.catalog.title") }]} />
      <CatalogView
        key={kind}
        kind={kind}
        indicators={indicators}
        entities={entities}
        topics={options.topics}
        subtitle={t("console.catalog.subtitle", { indicators: counts.indicators, entities: counts.entities })}
      />
    </>
  );
}

export default async function CatalogPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-[560px] w-full rounded-lg" />
        </div>
      }
    >
      <Content locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
