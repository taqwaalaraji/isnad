"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { ActionResult } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/provider";

import { approveCheck, approveMatches, archiveCheck, publishCheck, recheck, sendForReview } from "../actions";
import type { CheckDetail } from "../queries";
import { isnadNote, toSrt } from "./export";
import type { Capabilities } from "./types";

type DialogKind = "review" | "publish" | "note" | "archive" | null;

const REVIEWABLE = ["awaiting_review", "in_review", "escalated"];

export function CheckActions({
  detail,
  caps,
  editors,
  siteUrl,
}: {
  detail: CheckDetail;
  caps: Capabilities;
  editors: Array<{ id: string; name: string }>;
  siteUrl: string;
}) {
  const { t, locale } = useI18n();
  const { check, claims, segments } = detail;
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [editor, setEditor] = useState<string>(check.assigned_editor_id ?? "");
  const [url, setUrl] = useState(check.published_url ?? "");
  const [pending, startTransition] = useTransition();

  const status = check.status;
  const reviewable = REVIEWABLE.includes(status);
  const pendingMatches = claims.filter((c) => c.review_state === "pending" && c.result?.verdict === "match" && !c.result.needs_review).length;
  // Mirrors approve_check: escalated numbers always block; pending "differs" block under the newsroom policy.
  const escalated = claims.filter((c) => c.checkable && c.review_state === "escalated").length;
  const pendingDiffers = claims.filter((c) => c.checkable && c.review_state === "pending" && c.result?.verdict === "differs").length;
  const strictDiffers = check.newsroom?.require_approval_for_differs ?? true;
  const canApproveCheck = claims.some((c) => c.checkable) && escalated === 0 && (!strictDiffers || pendingDiffers === 0);
  const isMedia = check.input_kind === "video" || check.input_kind === "audio";
  const publicUrl = check.public_slug ? `${siteUrl}/${locale}/n/${check.public_slug}` : null;

  function run(action: () => Promise<ActionResult<unknown>>, success: string, close = true) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        if (close) setDialog(null);
      } else toast.error(t(res.error));
    });
  }

  function downloadSrt() {
    const blob = new Blob([toSrt(segments)], { type: "application/x-subrip;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${check.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "isnad"}.srt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  const note = dialog === "note" ? isnadNote(detail, locale, publicUrl, t) : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {caps.canEdit && reviewable && !caps.canDecide && (
        <Button variant="primary" icon="send" onClick={() => setDialog("review")}>
          {t("check.sendForReview")}
        </Button>
      )}
      {caps.canDecide && reviewable && (
        <>
          {canApproveCheck ? (
            <Button variant="primary" icon="check" loading={pending} onClick={() => run(() => approveCheck(check.id), t("check.checkApproved"))}>
              {t("check.approveCheck")}
            </Button>
          ) : (
            caps.canEdit && (
              <Button variant="primary" icon="send" onClick={() => setDialog("review")}>
                {t("check.sendForReview")}
              </Button>
            )
          )}
          {pendingMatches > 0 && (
            <Button
              icon="check"
              loading={pending}
              onClick={() =>
                run(
                  () => approveMatches(check.id),
                  t("check.approvedMatches", { n: pendingMatches }),
                )
              }
            >
              {t("check.approveMatches")}
            </Button>
          )}
        </>
      )}
      {caps.canDecide && status === "approved" && (
        <Button variant="primary" icon="globe" onClick={() => setDialog("publish")}>
          {t("check.markPublished")}
        </Button>
      )}

      {status !== "processing" && status !== "failed" && (
        <Menu>
          <MenuTrigger asChild>
            <Button icon="download">{t("common.export")}</Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon="copy" onSelect={() => setDialog("note")}>
              {t("check.exportNote")}
            </MenuItem>
            {isMedia && segments.length > 0 && (
              <MenuItem icon="captions" onSelect={downloadSrt}>
                {t("check.exportSubtitles")}
              </MenuItem>
            )}
            {publicUrl && (
              <MenuItem icon="external" onSelect={() => window.open(publicUrl, "_blank", "noopener")}>
                {t("check.publicPage")}
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      )}

      {(caps.canEdit || caps.canDecide) && status !== "processing" && (
        <Menu>
          <MenuTrigger asChild>
            <IconButton icon="more" label={t("common.more")} variant="secondary" />
          </MenuTrigger>
          <MenuContent>
            {caps.canEdit && status !== "archived" && (
              <MenuItem icon="refresh" onSelect={() => run(() => recheck(check.id), t("check.recheckStarted"))}>
                {status === "failed" ? t("common.retry") : t("check.recheck")}
              </MenuItem>
            )}
            {caps.canDecide && status === "published" && (
              <MenuItem icon="link" onSelect={() => setDialog("publish")}>
                {t("check.markPublished")}
              </MenuItem>
            )}
            {caps.canEdit && status !== "archived" && (
              <>
                <MenuSeparator />
                <MenuItem icon="archive" danger onSelect={() => setDialog("archive")}>
                  {t("check.archive")}
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === "review" && (
          <DialogContent
            closeLabel={t("common.close")}
            title={t("check.sendForReviewTitle")}
            description={t("check.sendForReviewBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" icon="send" loading={pending} onClick={() => run(() => sendForReview(check.id, editor || null), t("check.sent"))}>
                  {t("check.sendForReview")}
                </Button>
              </>
            }
          >
            <Field label={t("roles.editor")} htmlFor="editor">
              <Select id="editor" value={editor} onChange={(e) => setEditor(e.target.value)}>
                <option value="">{t("check.anyEditor")}</option>
                {editors.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
          </DialogContent>
        )}
        {dialog === "publish" && (
          <DialogContent
            closeLabel={t("common.close")}
            title={t("check.publishTitle")}
            description={t("check.publishBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="primary"
                  loading={pending}
                  disabled={!/^https?:\/\/\S+$/i.test(url.trim())}
                  onClick={() => run(() => publishCheck(check.id, url), t("check.published"))}
                >
                  {t("common.save")}
                </Button>
              </>
            }
          >
            <Field label={t("check.publishedUrl")} htmlFor="published-url">
              <Input id="published-url" dir="ltr" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          </DialogContent>
        )}
        {dialog === "archive" && (
          <DialogContent
            size="sm"
            closeLabel={t("common.close")}
            title={t("check.archiveTitle")}
            description={t("check.archiveBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" icon="archive" loading={pending} onClick={() => run(() => archiveCheck(check.id), t("check.archived"))}>
                  {t("check.archive")}
                </Button>
              </>
            }
          />
        )}
        {dialog === "note" && (
          <DialogContent
            size="lg"
            closeLabel={t("common.close")}
            title={t("check.noteTitle")}
            description={t("check.noteBody")}
            footer={
              <>
                <span className="me-auto self-center text-xs text-muted">{t("check.noteOnlyApproved")}</span>
                <Button
                  variant="primary"
                  icon="copy"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(note);
                      toast.success(t("common.copied"));
                    } catch {
                      toast.error(t("errors.generic"));
                    }
                  }}
                >
                  {t("check.noteCopy")}
                </Button>
              </>
            }
          >
            {note ? (
              <pre className="max-h-[50vh] overflow-y-auto rounded-md bg-surface-sunken p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">{note}</pre>
            ) : (
              <p className="text-sm text-muted">{t("check.noteEmpty")}</p>
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
