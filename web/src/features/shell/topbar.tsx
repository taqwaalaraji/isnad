"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { LocaleSwitch } from "@/components/shell/locale-switch";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/provider";

export function Topbar({ name, alerts, showSearch = true }: { name: string; alerts: number; showSearch?: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const query = q.trim();
    if (query) router.push(`/${locale}/registry?q=${encodeURIComponent(query)}`);
  }

  return (
    <div className="flex items-center gap-1 md:gap-2">
      {showSearch && (
        <form onSubmit={submit} role="search" className="relative hidden md:block">
          <Icon name="search" size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("nav.searchPlaceholder")}
            aria-label={t("common.search")}
            className="h-9 w-64 rounded-md border border-border bg-surface ps-9 pe-3 text-sm placeholder:text-subtle focus:border-accent focus:outline-none lg:w-80"
          />
        </form>
      )}
      <LocaleSwitch className="hidden px-2 sm:block" />
      <ThemeToggle />
      <Link
        href={`/${locale}/alerts`}
        aria-label={t("nav.alerts")}
        className="relative inline-flex size-10 items-center justify-center rounded-md text-text hover:bg-surface-sunken"
      >
        <Icon name="bell" size={20} />
        {alerts > 0 && <span className="absolute end-2 top-2 size-2 rounded-full bg-differ" aria-hidden />}
      </Link>
      <Link href={`/${locale}/settings`} aria-label={t("nav.settings")} className="rounded-full p-1 hover:bg-surface-sunken">
        <Avatar name={name} size={30} />
      </Link>
    </div>
  );
}
