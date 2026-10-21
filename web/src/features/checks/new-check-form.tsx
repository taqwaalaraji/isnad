"use client";

import { type DragEvent, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input, Radio, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { formatBytes } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { createCheck, createUploadUrl } from "./actions";
import { clearPendingFile, mimeOf, peekPendingFile } from "./pending-file";
import { uploadWithProgress } from "./upload";

type Source = "file" | "link" | "text";
type Uploaded = { path: string; name: string; size: number; type: string; kind: "video" | "audio" | "document" };

const ACCEPT = "video/*,audio/*,.pdf,.docx,.txt,.html";

function guessTitle(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
}

export function NewCheckForm({
  desks,
  defaultDeskId,
  defaultVisibility,
  retentionDays,
  initialSource = "file",
  initialUrl = "",
}: {
  desks: { id: string; name: string }[];
  defaultDeskId: string | null;
  defaultVisibility: "private" | "desk" | "newsroom";
  retentionDays: number;
  initialSource?: Source;
  initialUrl?: string;
}) {
  const { t, locale } = useI18n();
  const [source, setSource] = useState<Source>(initialSource);
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [maxDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [deskId, setDeskId] = useState<string | null>(defaultDeskId);
  const [speakers, setSpeakers] = useState("");
  const [dialect, setDialect] = useState<"msa" | "gulf" | "egyptian" | "levantine" | "other">("msa");
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > 500 * 1024 * 1024) {
      setError("newCheck.fileTooLarge");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setUploaded(null);
    setProgress(0);
    const type = mimeOf(file);
    const ticket = await createUploadUrl({ name: file.name, size: file.size, type });
    if (!ticket.ok) {
      setProgress(null);
      setError(ticket.error);
      return;
    }
    try {
      // Storage checks the media type; browsers leave it empty for some formats (e.g. .m4a, .opus).
      const typed = file.type === type ? file : new File([file], file.name, { type });
      await uploadWithProgress(ticket.data!.signedUrl, typed, setProgress, controller.signal);
      setUploaded({ path: ticket.data!.path, name: file.name, size: file.size, type, kind: ticket.data!.kind });
      if (!title) setTitle(guessTitle(file.name));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("newCheck.uploadFailed");
    } finally {
      setProgress(null);
    }
  }

  // A file dropped on the home page arrives here.
  // (Taken in a timer so a dev double-mount doesn't upload twice: the first mount's timer is cleared.)
  useEffect(() => {
    const file = peekPendingFile();
    if (!file) return;
    const timer = setTimeout(() => {
      clearPendingFile();
      void handleFile(file);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, []);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function submit() {
    setError(null);
    if (!title.trim()) return setError("newCheck.errors.titleRequired");
    const meta = { locale, title, recordedAt, deskId, speakers, dialect, visibility };
    let input;
    if (source === "file") {
      if (!uploaded) return setError("newCheck.errors.needInput");
      input = { ...meta, source: "file" as const, storagePath: uploaded.path, fileName: uploaded.name, fileType: uploaded.type, fileSize: uploaded.size };
    } else if (source === "link") {
      if (!/^https?:\/\/\S+\.\S+/.test(url.trim())) return setError("newCheck.errors.linkInvalid");
      input = { ...meta, source: "link" as const, url: url.trim() };
    } else {
      if (text.trim().length < 20) return setError("newCheck.errors.textShort");
      input = { ...meta, source: "text" as const, text };
    }
    startTransition(async () => {
      const result = await createCheck(input);
      if (result && !result.ok) {
        setError(result.error);
        toast.error(t(result.error));
      }
    });
  }

  const deskName = desks.find((d) => d.id === deskId)?.name;

  return (
    <Card className="p-5 md:p-6">
      <Segmented
        label={t("newCheck.title")}
        value={source}
        onChange={(v) => {
          setSource(v);
          setError(null);
        }}
        options={[
          { value: "file", label: t("newCheck.tabs.file") },
          { value: "link", label: t("newCheck.tabs.link") },
          { value: "text", label: t("newCheck.tabs.text") },
        ]}
      />

      <div className="mt-5">
        {source === "file" &&
          (uploaded || progress !== null ? (
            <div className="flex items-center gap-4 rounded-md border border-border bg-surface-sunken/60 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Icon name={uploaded?.kind === "audio" ? "mic" : uploaded?.kind === "document" ? "file" : "video"} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" dir="ltr">
                  {uploaded?.name ?? "…"}
                </p>
                {progress !== null ? (
                  <div className="mt-2 space-y-1">
                    <ProgressBar value={progress * 100} label={t("newCheck.uploading", { percent: Math.round(progress * 100) })} />
                    <p className="num text-xs text-muted">{t("newCheck.uploading", { percent: Math.round(progress * 100) })}</p>
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs text-muted">{t("newCheck.uploaded", { size: formatBytes(uploaded!.size, locale) })}</p>
                )}
              </div>
              <button
                type="button"
                className="rounded-md p-2 text-muted hover:bg-surface hover:text-text"
                aria-label={t("newCheck.removeFile")}
                onClick={() => {
                  abortRef.current?.abort();
                  setUploaded(null);
                  setProgress(null);
                }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:border-accent",
              )}
            >
              <span className="flex size-12 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Icon name="upload" size={22} />
              </span>
              <span className="font-semibold">{t("newCheck.dropTitle")}</span>
              <span className="text-xs text-muted">{t("newCheck.dropHint")}</span>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
            </button>
          ))}

        {source === "link" && (
          <Field label={t("newCheck.linkLabel")} htmlFor="url" hint={t("newCheck.linkHint")}>
            <Input id="url" type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("newCheck.linkPlaceholder")} />
          </Field>
        )}

        {source === "text" && (
          <Field label={t("newCheck.textLabel")} htmlFor="text">
            <Textarea id="text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("newCheck.textPlaceholder")} />
          </Field>
        )}
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label={t("newCheck.titleLabel")} htmlFor="title" hint={t("newCheck.titleHint")} className="md:col-span-2">
          <Input id="title" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} placeholder={t("newCheck.titlePlaceholder")} />
        </Field>
        <Field label={t("newCheck.recordedAt")} htmlFor="recordedAt" hint={t("newCheck.recordedAtHint")}>
          <Input id="recordedAt" type="date" value={recordedAt} max={maxDate} onChange={(e) => setRecordedAt(e.target.value)} />
        </Field>
        <Field label={t("newCheck.desk")} htmlFor="desk">
          <Select id="desk" value={deskId ?? ""} onChange={(e) => setDeskId(e.target.value || null)}>
            <option value="">{t("newCheck.noDesk")}</option>
            {desks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        {source === "file" && uploaded?.kind !== "document" && (
          <>
            <Field label={`${t("newCheck.speakers")} (${t("common.optional")})`} htmlFor="speakers">
              <Input id="speakers" value={speakers} onChange={(e) => setSpeakers(e.target.value)} placeholder={t("newCheck.speakersPlaceholder")} />
            </Field>
            <Field label={t("newCheck.dialect")} htmlFor="dialect">
              <Select id="dialect" value={dialect} onChange={(e) => setDialect(e.target.value as typeof dialect)}>
                {(["msa", "gulf", "egyptian", "levantine", "other"] as const).map((d) => (
                  <option key={d} value={d}>
                    {t(`newCheck.dialects.${d}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-sm font-medium">{t("newCheck.visibility")}</legend>
          <div className="flex flex-wrap gap-5">
            {(["private", "desk", "newsroom"] as const).map((v) => (
              <Radio
                key={v}
                name="visibility"
                checked={visibility === v}
                disabled={v === "desk" && !deskId}
                onChange={() => setVisibility(v)}
                label={v === "desk" && deskName ? `${t("newCheck.visibilityOptions.desk")} · ${deskName}` : t(`newCheck.visibilityOptions.${v}`)}
              />
            ))}
          </div>
        </fieldset>
      </div>

      {error && (
        <p role="alert" className="mt-5 flex items-center gap-2 rounded-md bg-differ-tint px-3 py-2 text-sm text-differ-text">
          <Icon name="alert" size={16} />
          {t(error)}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-xs text-muted">{t("newCheck.retentionNote", { days: retentionDays })}</p>
        <Button variant="primary" iconEnd="arrow-right" onClick={submit} loading={pending} disabled={progress !== null}>
          {pending ? t("newCheck.starting") : t("newCheck.start")}
        </Button>
      </div>
    </Card>
  );
}
