"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { addDocumentLink } from "../actions";

/** Add a document to a source by its link; the worker fetches, stores and extracts it. */
export function AddDocument({ sourceId, domains, disabled }: { sourceId: string; domains: string[]; disabled?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [language, setLanguage] = useState<"ar" | "en" | "ar,en">("ar");
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addDocumentLink({ sourceId, title, url, publishedAt: publishedAt || null, language });
      if (res.ok) {
        toast.success(t("console.sources.detail.added"));
        setOpen(false);
        setTitle("");
        setUrl("");
        setPublishedAt("");
      } else setError(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button icon="plus" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        {t("console.sources.detail.addDocument")}
      </Button>
      {open && (
        <DialogContent
          closeLabel={t("common.close")}
          title={t("console.sources.detail.addDocument")}
          description={t("console.sources.detail.addDocumentBody")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="primary" icon="download" loading={pending} disabled={!title.trim() || !url.trim()} onClick={submit}>
                {t("console.sources.fetchNow")}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label={t("console.sources.documentTitle")} htmlFor="doc-title">
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label={t("console.sources.documentUrl")} htmlFor="doc-url" hint={domains.join(" · ")}>
              <Input id="doc-url" dir="ltr" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("console.sources.detail.publishedAt")} htmlFor="doc-date">
                <Input id="doc-date" type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
              </Field>
              <Field label={t("console.sources.detail.language")} htmlFor="doc-lang">
                <Select id="doc-lang" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
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
  );
}
