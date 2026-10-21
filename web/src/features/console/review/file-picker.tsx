"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Select } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/provider";

/** Switch between files awaiting review. */
export function FilePicker({ files, current }: { files: Array<{ id: string; title: string; count: number }>; current: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <label htmlFor="review-file" className="shrink-0 text-sm text-muted">
        {t("console.review.queue")}
      </label>
      <div className="min-w-0 flex-1 sm:max-w-md">
        <Select
          id="review-file"
          value={current}
          disabled={pending}
          onChange={(e) => startTransition(() => router.push(`/${locale}/console/review?version=${e.target.value}`))}
        >
          {files.map((file) => (
            <option key={file.id} value={file.id}>
              {file.title} ({file.count})
            </option>
          ))}
        </Select>
      </div>
      <span className="num shrink-0 text-xs text-muted">{t("console.review.filesCount", { n: files.length })}</span>
    </div>
  );
}
