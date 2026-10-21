"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

import { setFollow } from "./actions";

/** Follow an indicator or entity: followers get alerts when new or revised figures are published. */
export function FollowButton({ targetType, targetId, following }: { targetType: "indicator" | "entity"; targetId: string; following: boolean }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(following);

  return (
    <Button
      icon={optimistic ? "check" : "bookmark"}
      aria-pressed={optimistic}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const next = !optimistic;
          setOptimistic(next);
          const result = await setFollow({ targetType, targetId, follow: next });
          if (result.ok) toast.success(next ? t("registry.indicator.followed") : t("registry.indicator.unfollowed"));
          else toast.error(t(result.error));
        })
      }
    >
      {optimistic ? t("registry.following") : t("registry.follow")}
    </Button>
  );
}
