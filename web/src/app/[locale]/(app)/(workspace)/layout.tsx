import { Suspense } from "react";

import { Shell } from "@/components/shell/shell";
import { newsroomCounts } from "@/features/shell/queries";
import { NewsroomSidebar, SidebarSkeleton } from "@/features/shell/sidebars";
import { Topbar } from "@/features/shell/topbar";
import { requireNewsroom } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";

async function Sidebar({ locale }: { locale: Locale }) {
  const viewer = await requireNewsroom(locale);
  return <NewsroomSidebar viewer={viewer} locale={locale} />;
}

async function Bar({ locale }: { locale: Locale }) {
  const viewer = await requireNewsroom(locale);
  const counts = await newsroomCounts(viewer);
  return <Topbar name={viewer.fullName} alerts={counts.alerts} />;
}

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Shell
      sidebar={
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar locale={locale} />
        </Suspense>
      }
      topbar={
        <Suspense>
          <Bar locale={locale} />
        </Suspense>
      }
    >
      {children}
    </Shell>
  );
}
