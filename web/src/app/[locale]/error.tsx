"use client";

import { useEffect } from "react";

import { StatePanel } from "@/components/states/state-panel";
import { Button, ButtonLink } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, locale } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatePanel icon="alert" title={t("states.errorTitle")} body={t("states.errorBody")}>
      <Button variant="primary" icon="refresh" onClick={reset}>
        {t("common.retry")}
      </Button>
      <ButtonLink href={`/${locale}`} icon="home">
        {t("states.goHome")}
      </ButtonLink>
      {error.digest && <p className="w-full text-xs text-subtle">#{error.digest}</p>}
    </StatePanel>
  );
}
