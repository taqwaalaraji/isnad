"use client";

import { NotFoundState } from "@/components/states/not-found-state";
import { useI18n } from "@/lib/i18n/provider";

/** Inside the console shell, so the sidebar stays. */
export default function ConsoleNotFound() {
  const { locale } = useI18n();
  return <NotFoundState home={`/${locale}/console`} />;
}
