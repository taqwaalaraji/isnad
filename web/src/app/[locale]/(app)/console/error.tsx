"use client";

import { ErrorState } from "@/components/states/error-state";
import { useI18n } from "@/lib/i18n/provider";

/** Inside the console shell, so the sidebar stays and the person can move on. */
export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useI18n();
  return <ErrorState error={error} reset={reset} home={`/${locale}/console`} />;
}
