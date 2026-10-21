import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Skeleton } from "@/components/ui/card";
import { AskPanel } from "@/features/registry/ask-panel";
import { ModeTabs } from "@/features/registry/search-box";
import { requireNewsroom } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/registry/ask">;

async function Content({ params, searchParams }: Props) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 500) : "";
  const base = `/${locale}/registry`;
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("registry.title"), href: base }, { label: t("registry.ask.title") }]} />
      <PageHeader
        title={t("registry.ask.title")}
        subtitle={t("registry.ask.subtitle")}
        actions={
          <ButtonLink href={`${base}/coverage`} icon="grid">
            {t("registry.coverage")}
          </ButtonLink>
        }
      />
      <div className="mb-4">
        <ModeTabs mode="ask" />
      </div>
      <AskPanel key={q} initialQuestion={q} />
    </>
  );
}

export default function AskPage(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
      <Content {...props} />
    </Suspense>
  );
}
