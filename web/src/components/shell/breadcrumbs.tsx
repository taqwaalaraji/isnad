"use client";

import Link from "next/link";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/provider";

export type Crumb = { label: string; href?: string };

// Separate contexts: pages only need the (stable) setter, so setting crumbs doesn't re-render them.
const CrumbsContext = createContext<Crumb[]>([]);
const SetCrumbsContext = createContext<((crumbs: Crumb[]) => void) | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  return (
    <SetCrumbsContext value={setCrumbs}>
      <CrumbsContext value={crumbs}>{children}</CrumbsContext>
    </SetCrumbsContext>
  );
}

/** Pages declare their breadcrumb trail; the top bar shows it. */
export function SetBreadcrumbs({ items }: { items: Crumb[] }) {
  const setCrumbs = useContext(SetCrumbsContext);
  const { t } = useI18n();
  const key = JSON.stringify(items);
  const appName = t("common.appName");
  useEffect(() => {
    const crumbs: Crumb[] = JSON.parse(key);
    setCrumbs?.(crumbs);
    // In-app pages take their tab title from the deepest crumb.
    const last = crumbs.at(-1)?.label;
    if (last) document.title = `${last} · ${appName}`;
  }, [setCrumbs, key, appName]);
  return null;
}

export function Breadcrumbs() {
  const crumbs = useContext(CrumbsContext);
  const { t } = useI18n();
  if (!crumbs.length) return null;
  return (
    <nav aria-label={t("nav.breadcrumb")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <Icon name="chevron-left" size={14} className="shrink-0 text-subtle ltr:rotate-180" />}
              {crumb.href && !last ? (
                <Link href={crumb.href} className="truncate text-muted hover:text-text">
                  {crumb.label}
                </Link>
              ) : (
                <span className={last ? "truncate font-semibold text-text" : "truncate text-muted"} aria-current={last ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
