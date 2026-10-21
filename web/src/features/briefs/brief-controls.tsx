"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import { subscribeAsUser } from "@/lib/supabase/realtime";

import { deleteBrief, regenerateBrief } from "./actions";

/** Refreshes the page when the worker finishes (or restarts) this brief. */
export function useBriefRealtime(briefId: string) {
  const router = useRouter();
  useEffect(
    () =>
      subscribeAsUser(`brief:${briefId}`, (channel) =>
        channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "briefs", filter: `id=eq.${briefId}` }, () => router.refresh()),
      ),
    [briefId, router],
  );
}

export function BriefRealtime({ briefId }: { briefId: string }) {
  useBriefRealtime(briefId);
  return null;
}

export function BriefControls({ briefId, generating, canDelete }: { briefId: string; generating: boolean; canDelete: boolean }) {
  const { t, locale } = useI18n();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const printHref = `/${locale}/print/briefs/${briefId}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        icon="refresh"
        loading={pending}
        disabled={generating}
        onClick={() =>
          startTransition(async () => {
            const res = await regenerateBrief(briefId);
            if (!res.ok) toast.error(t(res.error));
          })
        }
      >
        {t("briefs.regenerate")}
      </Button>
      <Button icon="printer" disabled={generating} onClick={() => window.open(printHref, "_blank", "noopener")}>
        {t("briefs.print")}
      </Button>
      <Button
        variant="primary"
        icon="share"
        disabled={generating}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            toast.success(t("briefs.linkCopied"));
          } catch {
            toast.error(t("errors.generic"));
          }
        }}
      >
        {t("briefs.share")}
      </Button>
      {canDelete && (
        <Menu>
          <MenuTrigger asChild>
            <IconButton icon="more" variant="secondary" label={t("common.more")} />
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon="trash" danger onSelect={() => setConfirming(true)}>
              {t("common.delete")}
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        {confirming && (
          <DialogContent
            size="sm"
            closeLabel={t("common.close")}
            title={t("briefs.deleteTitle")}
            description={t("briefs.deleteBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="danger"
                  icon="trash"
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await deleteBrief(briefId, locale);
                      if (res && !res.ok) toast.error(t(res.error));
                    })
                  }
                >
                  {t("common.delete")}
                </Button>
              </>
            }
          />
        )}
      </Dialog>
    </div>
  );
}

/** Opens the browser's print dialog once the sheet has rendered (the print view). */
export function AutoPrint() {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 400);
    return () => clearTimeout(id);
  }, []);
  return null;
}
