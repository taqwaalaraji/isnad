"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/provider";

/** Search | Ask Isnad: two pages that share one hero, switched by links (each keeps its own URL). */
export function ModeTabs({ mode }: { mode: "search" | "ask" }) {
  const { t, locale } = useI18n();
  const items = [
    { key: "search", label: t("registry.searchTab"), href: `/${locale}/registry` },
    { key: "ask", label: t("registry.askTab"), href: `/${locale}/registry/ask` },
  ] as const;
  return (
    <nav aria-label={t("registry.title")} className="inline-flex rounded-md bg-surface-sunken p-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={mode === item.key ? "page" : undefined}
          className={cn(
            "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
            mode === item.key ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function SearchBox({ initial }: { initial: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState(initial);

  function go(query: string) {
    const q = query.trim();
    router.push(q ? `/${locale}/registry?q=${encodeURIComponent(q)}` : `/${locale}/registry`);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
      className="relative"
    >
      <Icon name="search" size={20} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("registry.searchPlaceholder")}
        aria-label={t("registry.searchPlaceholder")}
        maxLength={200}
        className="h-14 w-full rounded-md border border-border bg-surface ps-12 pe-28 text-base text-text placeholder:text-subtle focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              if (initial) go("");
            }}
            aria-label={t("registry.clearSearch")}
            className="rounded-sm p-2 text-muted hover:bg-surface-sunken hover:text-text"
          >
            <Icon name="x" size={16} />
          </button>
        )}
        <button type="submit" className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover">
          {t("common.search")}
        </button>
      </div>
    </form>
  );
}
