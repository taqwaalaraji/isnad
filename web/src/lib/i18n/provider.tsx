"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries/ar";
import { createTranslator, type Translate } from "./translate";

type I18nValue = { locale: Locale; t: Translate };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, t: createTranslator(dictionary) }), [locale, dictionary]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return value;
}
