"use client";

import { StatePanel } from "@/components/states/state-panel";
import { ButtonLink } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

export function NotFoundState({ home }: { home?: string }) {
  const { t, locale } = useI18n();
  return (
    <StatePanel icon="search" title={t("states.notFoundTitle")} body={t("states.notFoundBody")}>
      <ButtonLink href={home ?? `/${locale}`} variant="primary" icon="home">
        {t("states.goHome")}
      </ButtonLink>
    </StatePanel>
  );
}
