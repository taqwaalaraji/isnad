import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader, Skeleton } from "@/components/ui/card";
import { settingsData } from "@/features/settings/queries";
import { SETTINGS_TABS, type SettingsTab } from "@/features/settings/prefs";
import { SettingsView } from "@/features/settings/settings-view";
import { requireNewsroom } from "@/lib/auth";
import { env } from "@/lib/env";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/settings">;

async function Content({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const [viewer, t, query] = await Promise.all([requireNewsroom(locale), getT(locale), searchParams]);
  const data = await settingsData(viewer.id, viewer.active.newsroomId);
  const tab = SETTINGS_TABS.includes(query.tab as SettingsTab) ? (query.tab as SettingsTab) : "profile";
  return (
    <>
      <SetBreadcrumbs items={[{ label: t("settings.title") }]} />
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <SettingsView
        data={data}
        tab={tab}
        roleLabel={[t(`roles.${viewer.active.role}`), viewer.active.deskName].filter(Boolean).join(" · ")}
        newsroomName={viewer.active.newsroomName}
        botConfigured={!!env.telegramBotUsername}
      />
    </>
  );
}

export default async function SettingsPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <Content locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
