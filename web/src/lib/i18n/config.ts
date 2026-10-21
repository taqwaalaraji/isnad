export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";
export const LOCALE_COOKIE = "isnad_locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function dir(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** BCP 47 tag for Intl formatting. Western digits in both languages, as the design specifies. */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-AE-u-nu-latn" : "en-AE";
}
