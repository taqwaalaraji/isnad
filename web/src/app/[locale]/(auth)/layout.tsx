import Image from "next/image";
import { Suspense } from "react";

import { LocaleSwitch } from "@/components/shell/locale-switch";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Nuqta } from "@/components/ui/nuqta";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

export default async function AuthLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const t = await getT(locale);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
      <main className="flex flex-col bg-paper px-6 py-6 text-ink dark:bg-bg dark:text-text sm:px-12">
        <div className="flex items-center justify-end gap-2">
          <Suspense>
            <LocaleSwitch />
          </Suspense>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-xs text-muted">{t("auth.help")}</p>
      </main>

      <aside className="relative hidden overflow-hidden bg-nav text-nav-text lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute -end-28 top-1/4 flex flex-col gap-6 opacity-90">
          <span className="block size-56 rotate-45 rounded-[36px] bg-sky" />
          <span className="block size-56 rotate-45 rounded-[36px] bg-lapis/40" />
          <span className="block size-56 rotate-45 rounded-[36px] bg-lapis/20" />
        </div>
        <div className="relative flex justify-end">
          <Image src="/brand/isnad-logo-bilingual-reversed.svg" alt={t("common.appName")} width={150} height={36} priority />
        </div>
        <div className="relative ms-auto max-w-md text-end">
          <p className="text-5xl leading-tight font-bold">{t("common.tagline")}</p>
          <p className="mt-2 font-latin text-lg text-nav-muted" lang="en" dir="ltr">
            {t("common.taglineLatin")}
          </p>
          <div className="mt-10 inline-flex flex-col items-end gap-2 rounded-md border border-nav-border bg-nav-raised/60 px-4 py-3 text-sm">
            <p>
              {t("auth.heroClaim")} <span className="num rounded-sm bg-lapis/30 px-1.5 py-0.5">3.8%</span> {t("auth.heroPeriod")}
            </p>
            <p className="flex items-center gap-2 text-xs text-nav-muted">
              <span className="flex items-center gap-1 text-sky">
                <Nuqta size={6} className="!bg-sky" /> {t("chain.connected")}
              </span>
              · {t("auth.heroSource")}
            </p>
          </div>
        </div>
        <p className="relative text-xs text-nav-muted">© 2026 · {t("common.appName")}</p>
      </aside>
    </div>
  );
}
