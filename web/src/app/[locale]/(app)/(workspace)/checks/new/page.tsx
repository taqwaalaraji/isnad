import Link from "next/link";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Card, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { NewCheckForm } from "@/features/checks/new-check-form";
import { newsroomDesks } from "@/features/checks/queries";
import { requireNewsroom } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

async function Content({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/[locale]/checks/new">["searchParams"] }) {
  const [viewer, t, params] = await Promise.all([requireNewsroom(locale), getT(locale), searchParams]);
  const supabase = await createClient();
  const [desks, { data: newsroom }, { data: topics }, telegram] = await Promise.all([
    newsroomDesks(viewer.active.newsroomId),
    supabase.from("newsrooms").select("default_visibility, media_retention_days").eq("id", viewer.active.newsroomId).single(),
    supabase.from("topics").select("slug, name_ar, name_en").order("sort_order").limit(8),
    supabase.from("telegram_links").select("user_id").eq("user_id", viewer.id).maybeSingle(),
  ]);
  const steps = [
    ["preparing", "preparingHint"],
    ["transcribing", "transcribingHint"],
    ["extracting", "extractingHint"],
    ["checking", "checkingHint"],
  ] as const;
  const initialSource = params.source === "link" || params.source === "text" ? params.source : "file";

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("nav.checks"), href: `/${locale}/checks` }, { label: t("newCheck.title") }]} />
      <PageHeader title={t("newCheck.title")} subtitle={t("newCheck.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <NewCheckForm
          desks={desks}
          defaultDeskId={viewer.active.deskId}
          defaultVisibility={newsroom?.default_visibility ?? "newsroom"}
          retentionDays={newsroom?.media_retention_days ?? 90}
          initialSource={initialSource}
          initialUrl={typeof params.url === "string" ? params.url : ""}
        />
        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-semibold">{t("newCheck.whatHappens")}</h2>
            <ol className="relative space-y-5 border-s border-border ps-5">
              {steps.map(([stage, hint]) => (
                <li key={stage} className="relative">
                  <span className="absolute -start-[27px] top-1 size-3 rounded-full border-2 border-border-strong bg-surface" />
                  <p className="text-sm font-medium">{t(`stage.${stage}`)}</p>
                  <p className="text-xs text-muted">{t(`stage.${hint}`)}</p>
                </li>
              ))}
            </ol>
          </Card>
          {telegram.data && (
            <div className="flex gap-3 rounded-lg bg-accent-soft p-4 text-sm text-accent">
              <Icon name="send" size={18} className="mt-0.5 shrink-0" />
              <p>{t("newCheck.telegramTip")}</p>
            </div>
          )}
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">{t("newCheck.coverageTitle")}</h2>
              <Link href={`/${locale}/registry/coverage`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                <Icon name="external" size={14} />
                {t("newCheck.coverageLink")}
              </Link>
            </div>
            <p className="text-sm text-muted">{(topics ?? []).map((tp) => (locale === "ar" ? tp.name_ar : tp.name_en)).join(" · ")}</p>
            <p className="mt-2 text-xs text-subtle">{t("newCheck.coverageBody")}</p>
          </Card>
        </aside>
      </div>
    </>
  );
}

export default async function NewCheckPage({ params, searchParams }: PageProps<"/[locale]/checks/new">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-[520px] w-full rounded-lg" />}>
      <Content locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
