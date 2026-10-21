import { Suspense } from "react";

import { Shell } from "@/components/shell/shell";
import { ConsoleSidebar, SidebarSkeleton } from "@/features/shell/sidebars";
import { Topbar } from "@/features/shell/topbar";
import { requireStaff } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";

async function Sidebar({ locale }: { locale: Locale }) {
  const viewer = await requireStaff(locale);
  return <ConsoleSidebar viewer={viewer} locale={locale} />;
}

async function Bar({ locale }: { locale: Locale }) {
  const viewer = await requireStaff(locale);
  return <Topbar name={viewer.fullName} alerts={0} showSearch={false} />;
}

export default async function ConsoleLayout({ children, params }: LayoutProps<"/[locale]/console">) {
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
