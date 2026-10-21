import Image from "next/image";
import Link from "next/link";

import { NavGroup, NavLink } from "@/components/shell/nav-link";
import { ButtonLink } from "@/components/ui/button";
import { isStaff, type Viewer } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

import { NewsroomSwitcher } from "./newsroom-switcher";
import { consoleCounts, newsroomCounts } from "./queries";
import { UserFooter } from "./user-footer";

function Logo({ locale, href }: { locale: Locale; href: string }) {
  return (
    <Link href={href} className="flex h-16 items-center px-5">
      <Image
        src={locale === "ar" ? "/brand/isnad-logo-arabic-reversed.svg" : "/brand/isnad-logo-bilingual-reversed.svg"}
        alt={locale === "ar" ? "إسناد" : "Isnad"}
        width={locale === "ar" ? 92 : 130}
        height={32}
        priority
      />
    </Link>
  );
}

export async function NewsroomSidebar({ viewer, locale }: { viewer: Viewer; locale: Locale }) {
  const t = await getT(locale);
  const counts = await newsroomCounts(viewer);
  const base = `/${locale}`;
  const admin = viewer.active?.role === "admin";
  return (
    <div className="flex h-full flex-col">
      <Logo locale={locale} href={base} />
      <div className="space-y-3 px-3">
        {viewer.active && <NewsroomSwitcher active={viewer.active} memberships={viewer.memberships} />}
        <ButtonLink href={`${base}/checks/new`} variant="primary" icon="plus" className="w-full">
          {t("common.newCheck")}
        </ButtonLink>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
        <NavGroup title={t("nav.workspace")}>
          <NavLink href={base} exact icon="home" label={t("nav.home")} />
          <NavLink href={`${base}/checks`} icon="checks" label={t("nav.checks")} count={counts.review} />
          <NavLink href={`${base}/registry`} icon="registry" label={t("nav.registry")} />
          <NavLink href={`${base}/alerts`} icon="bell" label={t("nav.alerts")} count={counts.alerts} />
          <NavLink href={`${base}/briefs`} icon="brief" label={t("nav.briefs")} />
        </NavGroup>
        {admin && (
          <NavGroup title={t("nav.newsroomAdmin")}>
            <NavLink href={`${base}/admin/members`} icon="users" label={t("nav.members")} />
            <NavLink href={`${base}/admin/sources`} icon="folder" label={t("nav.privateSources")} />
            <NavLink href={`${base}/admin/policies`} icon="sliders" label={t("nav.policies")} />
            <NavLink href={`${base}/admin/activity`} icon="activity" label={t("nav.activity")} />
          </NavGroup>
        )}
        {isStaff(viewer) && (
          <NavGroup title={t("nav.platform")}>
            <NavLink href={`${base}/console/sources`} icon="shield" label={t("nav.openConsole")} />
          </NavGroup>
        )}
      </nav>
      <UserFooter name={viewer.fullName} email={viewer.email} />
    </div>
  );
}

export async function ConsoleSidebar({ viewer, locale }: { viewer: Viewer; locale: Locale }) {
  const t = await getT(locale);
  const counts = await consoleCounts();
  const base = `/${locale}/console`;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pe-4">
        <Logo locale={locale} href={`${base}/sources`} />
        <span className="rounded-full bg-lapis/20 px-2 py-0.5 text-[11px] font-medium text-sky">{t("console.badge")}</span>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
        <NavGroup title={t("nav.sharedRegistry")}>
          <NavLink href={`${base}/sources`} icon="building" label={t("nav.officialSources")} />
          <NavLink href={`${base}/inbox`} icon="inbox" label={t("nav.inbox")} count={counts.inbox} />
          <NavLink href={`${base}/review`} icon="review" label={t("nav.figureReview")} count={counts.review} />
          <NavLink href={`${base}/catalog`} icon="catalog" label={t("nav.catalog")} />
          <NavLink href={`${base}/proposals`} icon="proposal" label={t("nav.proposals")} count={counts.proposals} />
        </NavGroup>
        <NavGroup title={t("nav.platform")}>
          <NavLink href={`${base}/newsrooms`} icon="newsroom" label={t("nav.newsrooms")} />
          <NavLink href={`${base}/quality`} icon="gauge" label={t("nav.quality")} />
          <NavLink href={`${base}/system`} icon="system" label={t("nav.system")} />
        </NavGroup>
        {viewer.active && (
          <NavGroup title={viewer.active.newsroomName}>
            <NavLink href={`/${locale}`} exact icon="arrow-right" label={t("nav.backToNewsroom")} />
          </NavGroup>
        )}
      </nav>
      <UserFooter name={viewer.fullName} email={viewer.email} />
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 p-4" aria-hidden>
      <div className="h-8 w-24 rounded bg-nav-raised" />
      <div className="mt-4 h-14 rounded-md bg-nav-raised" />
      <div className="h-10 rounded-md bg-lapis/60" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-8 rounded-md bg-nav-raised/50" />
      ))}
    </div>
  );
}
