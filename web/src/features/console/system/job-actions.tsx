"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

import { cancelJob, retryJob } from "../actions";

export function JobAction({ id, action }: { id: number; action: "retry" | "cancel" }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={action === "retry" ? "secondary" : "ghost"}
      icon={action === "retry" ? "refresh" : "x"}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = action === "retry" ? await retryJob(id) : await cancelJob(id);
          if (res.ok) toast.success(t(action === "retry" ? "console.system.retried" : "console.system.cancelledToast"));
          else toast.error(t(res.error));
        })
      }
    >
      {action === "retry" ? t("console.system.retry") : t("console.system.cancel")}
    </Button>
  );
}
