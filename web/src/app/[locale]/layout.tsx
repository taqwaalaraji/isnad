import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Outfit } from "next/font/google";
import { notFound } from "next/navigation";

import { Providers } from "@/components/shell/providers";
import { dir, isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/server";

import "../globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const ar = locale === "ar";
  return {
    title: { default: ar ? "إسناد" : "Isnad", template: ar ? "%s · إسناد" : "%s · Isnad" },
    description: ar
      ? "إسناد يعيد كل رقم في المحتوى الإعلامي إلى مصدره الرسمي."
      : "Isnad traces every number in media content back to its official source.",
    applicationName: "Isnad",
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F1EA" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1230" },
  ],
};

// Applies the saved theme before first paint so there's no flash.
const themeScript = `(function(){try{var t=localStorage.getItem('isnad-theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);

  return (
    <html
      lang={locale}
      dir={dir(locale)}
      className={`${plexArabic.variable} ${outfit.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-text">
        <Providers locale={locale} dictionary={dictionary}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
