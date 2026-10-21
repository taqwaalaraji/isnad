"use client";

import { type DragEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { uploadWithProgress } from "@/features/checks/upload";
import { formatBytes } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { createInboxUploadUrl, registerUpload } from "../actions";
import type { SourceOption } from "../queries";

const ACCEPT = ".pdf,.xlsx,.xls,.csv,.docx,.html,.htm,.txt";
const MAX = 100 * 1024 * 1024;

function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

/** The inbox drop zone and upload dialog: choose a file and its source, upload, then extraction starts. */
export function InboxUpload({ sources, compact = false }: { sources: SourceOption[]; compact?: boolean }) {
  const { t, locale } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [title, setTitle] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [language, setLanguage] = useState<"ar" | "en" | "ar,en">("ar");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();

  function pick(next: File | undefined) {
    if (!next) return;
    setError(null);
    if (!ACCEPT.split(",").some((ext) => next.name.toLowerCase().endsWith(ext))) {
      toast.error(t("console.inbox.errors.type"));
      return;
    }
    if (next.size > MAX) {
      toast.error(t("console.inbox.errors.size"));
      return;
    }
    setFile(next);
    setTitle(titleFromName(next.name));
    setOpen(true);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0]);
  }

  function reset() {
    setFile(null);
    setTitle("");
    setPublishedAt("");
    setProgress(null);
    setError(null);
    if (input.current) input.current.value = "";
  }

  function submit() {
    if (!file) return;
    if (!sourceId) return setError("console.inbox.errors.source");
    startTransition(async () => {
      setError(null);
      const ticket = await createInboxUploadUrl({ name: file.name, size: file.size, type: file.type });
      if (!ticket.ok) return setError(ticket.error);
      try {
        setProgress(0);
        await uploadWithProgress(ticket.data!.signedUrl, file, setProgress);
      } catch {
        setProgress(null);
        return setError("console.inbox.errors.upload");
      }
      const res = await registerUpload({ sourceId, title, publishedAt: publishedAt || null, language, stagingPath: ticket.data!.path });
      if (!res.ok) {
        setProgress(null);
        return setError(res.error);
      }
      toast.success(t("console.inbox.uploaded"));
      setOpen(false);
      reset();
    });
  }

  const byTier = [1, 2, 3].map((tier) => ({ tier, items: sources.filter((s) => s.tier === tier) })).filter((g) => g.items.length);

  return (
    <>
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
      {compact ? (
        <Button variant="primary" icon="upload" onClick={() => input.current?.click()}>
          {t("console.inbox.upload")}
        </Button>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "mb-5 flex flex-wrap items-center gap-3 rounded-lg border-[1.5px] border-dashed px-5 py-4 transition-colors",
            dragging ? "border-accent bg-accent-soft/50" : "border-accent/60",
          )}
        >
          <Icon name="inbox" size={20} className="text-accent" />
          <p className="flex-1 text-sm text-muted">{t("console.inbox.drop")}</p>
          <Button size="sm" icon="upload" onClick={() => input.current?.click()}>
            {t("console.inbox.choose")}
          </Button>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        {open && file && (
          <DialogContent
            closeLabel={t("common.close")}
            title={t("console.inbox.uploadTitle")}
            description={t("console.inbox.uploadBody")}
            footer={
              <>
                <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" icon="upload" loading={pending} disabled={!title.trim()} onClick={submit}>
                  {t("console.inbox.submit")}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md bg-surface-sunken px-3 py-2.5">
                <Icon name={/\.(xlsx?|csv)$/i.test(file.name) ? "table" : "file"} size={18} className="text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" dir="auto">
                    {file.name}
                  </p>
                  <p className="num text-xs text-muted">{formatBytes(file.size, locale)}</p>
                </div>
              </div>
              {progress !== null && (
                <div>
                  <ProgressBar value={progress * 100} label={t("console.inbox.upload")} />
                  <p className="num mt-1 text-xs text-muted">{t("console.inbox.uploading", { p: Math.round(progress * 100) })}</p>
                </div>
              )}
              <Field label={t("console.inbox.source")} htmlFor="upload-source">
                <Select id="upload-source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-invalid={error === "console.inbox.errors.source"}>
                  <option value="">{t("console.inbox.chooseSource")}</option>
                  {byTier.map((group) => (
                    <optgroup key={group.tier} label={t(`tier.${group.tier}` as MessageKey)}>
                      {group.items.map((s) => (
                        <option key={s.id} value={s.id}>
                          {locale === "ar" ? s.name_ar : s.name_en}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label={t("console.inbox.documentTitle")} htmlFor="upload-title">
                <Input id="upload-title" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("console.inbox.publishedAt")} htmlFor="upload-date">
                  <Input id="upload-date" type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
                </Field>
                <Field label={t("console.inbox.language")} htmlFor="upload-lang">
                  <Select id="upload-lang" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
                    {(["ar", "en", "ar,en"] as const).map((l) => (
                      <option key={l} value={l}>
                        {t(`console.inbox.languages.${l}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {error && (
                <p role="alert" className="rounded-md bg-differ-tint px-3 py-2 text-sm text-differ-text">
                  {t(error)}
                </p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
