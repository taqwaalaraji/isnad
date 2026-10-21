"use client";

import { useRouter } from "next/navigation";
import { type DragEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { setPendingFile } from "@/features/checks/pending-file";
import { useI18n } from "@/lib/i18n/provider";

/** Drop a clip or file to start a check; the new-check form picks the file up and uploads it. */
export function DropZone() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function start(file: File | undefined) {
    if (!file) return;
    setPendingFile(file);
    router.push(`/${locale}/checks/new`);
  }

  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        start(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        dragging ? "border-accent bg-accent-soft/60" : "border-accent/50 bg-surface",
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name="upload" size={22} />
      </span>
      <div>
        <p className="font-semibold">{t("home.dropTitle")}</p>
        <p className="mt-1 text-xs text-muted">{t("home.dropHint")}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="sm" icon="upload" onClick={() => inputRef.current?.click()}>
          {t("home.chooseFile")}
        </Button>
        <Button size="sm" icon="link" onClick={() => router.push(`/${locale}/checks/new?source=link`)}>
          {t("home.pasteLink")}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept="video/*,audio/*,.pdf,.docx,.txt,.html,.m4a,.opus"
        onChange={(e) => start(e.target.files?.[0])}
      />
    </div>
  );
}
