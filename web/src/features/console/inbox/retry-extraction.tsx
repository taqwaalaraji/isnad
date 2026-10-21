"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

import { retryExtraction } from "../actions";

export function RetryExtraction({ versionId, quiet = false }: { versionId: string; quiet?: boolean }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      const res = await retryExtraction(versionId);
      if (res.ok) toast.success(t("console.inbox.retried"));
      else toast.error(t(res.error));
    });
  return quiet ? (
    <IconButton icon="refresh" size="sm" label={t("console.inbox.retry")} disabled={pending} onClick={run} />
  ) : (
    <Button size="sm" icon="refresh" loading={pending} onClick={run}>
      {t("console.inbox.retry")}
    </Button>
  );
}
