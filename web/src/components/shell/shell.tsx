"use client";

import { type ReactNode, useState } from "react";

import { IconButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/lib/i18n/provider";

import { BreadcrumbProvider, Breadcrumbs } from "./breadcrumbs";

/** App frame: ink sidebar on the start side, top bar, scrolling content. Drawer below lg. */
export function Shell({ sidebar, topbar, children }: { sidebar: ReactNode; topbar: ReactNode; children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <BreadcrumbProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside
          // Following a link in the drawer closes it (no pathname hook: it would block prerendering).
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className={cn(
            "fixed inset-y-0 start-0 z-40 w-[264px] bg-nav transition-transform lg:sticky lg:top-0 lg:h-dvh",
            !open && "max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full",
          )}
        >
          {sidebar}
        </aside>
        {open && (
          <button
            type="button"
            aria-label={t("common.close")}
            className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur md:px-8">
            <IconButton icon="menu" label={t("nav.menu")} className="lg:hidden" onClick={() => setOpen(true)} />
            <div className="min-w-0 flex-1">
              <Breadcrumbs />
            </div>
            {topbar}
          </header>
          <main id="main" className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
