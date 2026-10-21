"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/components/ui/cn";
import { useI18n } from "@/lib/i18n/provider";

/** Links to the same page in the other language. */
export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const search = useSearchParams();
  const other = locale === "ar" ? "en" : "ar";
  const href = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${other}`) + (search.size ? `?${search}` : "");
  return (
    <Link href={href} hrefLang={other} lang={other} className={cn("text-sm text-muted hover:text-text", className)}>
      {t("common.language")}
    </Link>
  );
}
