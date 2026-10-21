"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button, ButtonLink } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

import { fetchSourceNow, setSourceStatus } from "../actions";

export function SourceActions({ id, status }: { id: string; status: string }) {
  const { t, locale } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <>
      <ButtonLink href={`/${locale}/console/sources/${id}/edit`} icon="edit">
        {t("console.sources.edit")}
      </ButtonLink>
      <Button
        icon={status === "paused" ? "play" : "pause"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const next = status === "paused" ? "active" : "paused";
            const res = await setSourceStatus(id, next);
            if (res.ok) toast.success(t(next === "paused" ? "console.sources.paused" : "console.sources.resumed"));
            else toast.error(t(res.error));
          })
        }
      >
        {status === "paused" ? t("console.sources.resume") : t("console.sources.pause")}
      </Button>
      <Button
        variant="primary"
        icon="refresh"
        loading={pending}
        disabled={status !== "active"}
        onClick={() =>
          startTransition(async () => {
            const res = await fetchSourceNow(id);
            if (!res.ok) toast.error(t(res.error));
            else if (!res.data) toast.info(t("console.sources.fetchNone"));
            else toast.success(t("console.sources.fetchQueued", { n: res.data }));
          })
        }
      >
        {t("console.sources.fetchNow")}
      </Button>
    </>
  );
}
