"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import { I18nProvider } from "@/lib/i18n/provider";

export function Providers({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <TooltipProvider>
        {children}
        <Toaster
          position={locale === "ar" ? "bottom-left" : "bottom-right"}
          dir={locale === "ar" ? "rtl" : "ltr"}
          toastOptions={{
            classNames: {
              toast: "!rounded-md !border !border-border !bg-surface-raised !text-text !shadow-popover !font-sans",
              description: "!text-muted",
            },
          }}
        />
      </TooltipProvider>
    </I18nProvider>
  );
}
