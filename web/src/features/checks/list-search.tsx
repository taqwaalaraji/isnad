"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { SearchInput } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/provider";

export function ListSearch({ placeholder }: { placeholder: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page");
      if (next.toString() !== params.toString()) {
        startTransition(() => router.replace(`${pathname}?${next}`));
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [value, params, pathname, router]);

  return (
    <SearchInput
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      aria-label={t("common.search")}
      className="w-full sm:w-72"
    />
  );
}
