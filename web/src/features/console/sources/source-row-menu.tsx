"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";

import { fetchSourceNow, setSourceStatus } from "../actions";

export function SourceRowMenu({ id, status, href }: { id: string; status: string; href: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function fetchNow() {
    startTransition(async () => {
      const res = await fetchSourceNow(id);
      if (!res.ok) toast.error(t(res.error));
      else if (!res.data) toast.info(t("console.sources.fetchNone"));
      else toast.success(t("console.sources.fetchQueued", { n: res.data }));
    });
  }

  function toggle() {
    const next = status === "paused" ? "active" : "paused";
    startTransition(async () => {
      const res = await setSourceStatus(id, next);
      if (res.ok) toast.success(t(next === "paused" ? "console.sources.paused" : "console.sources.resumed"));
      else toast.error(t(res.error));
    });
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon="more" label={t("common.actions")} size="sm" disabled={pending} />
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon="eye" onSelect={() => router.push(href)}>
          {t("console.sources.open")}
        </MenuItem>
        <MenuItem icon="edit" onSelect={() => router.push(`${href}/edit`)}>
          {t("console.sources.edit")}
        </MenuItem>
        <MenuItem icon="refresh" disabled={status !== "active"} onSelect={fetchNow}>
          {t("console.sources.fetchNow")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={status === "paused" ? "play" : "pause"} onSelect={toggle}>
          {status === "paused" ? t("console.sources.resume") : t("console.sources.pause")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
