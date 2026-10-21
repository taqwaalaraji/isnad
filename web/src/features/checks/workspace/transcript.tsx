"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { updateSegment } from "../actions";
import { HighlightedText, spansFor } from "./highlight";
import type { WorkspaceClaim, WorkspaceSegment } from "./types";

export function Transcript({
  segments,
  claims,
  currentMs,
  follow,
  editable,
  selectedId,
  onSeek,
  onSelectClaim,
}: {
  segments: WorkspaceSegment[];
  claims: WorkspaceClaim[];
  currentMs: number | null;
  follow: boolean;
  editable: boolean;
  selectedId: string | null;
  onSeek?: (ms: number) => void;
  onSelectClaim: (id: string) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const activeRef = useRef<HTMLLIElement | null>(null);

  const activeId =
    currentMs === null ? null : segments.find((s) => s.start_ms !== null && s.start_ms <= currentMs && currentMs < (s.end_ms ?? s.start_ms) + 250)?.id;

  useEffect(() => {
    if (follow && activeId && !editing) activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId, follow, editing]);

  function save(segment: WorkspaceSegment) {
    const text = draft.trim();
    if (!text || text === segment.text) {
      setEditing(null);
      return;
    }
    startTransition(async () => {
      const res = await updateSegment(segment.id, text);
      if (res.ok) {
        toast.success(t("check.segmentSaved"));
        setEditing(null);
      } else toast.error(t(res.error));
    });
  }

  if (segments.length === 0) return <p className="p-4 text-sm text-muted">{t("check.noTranscript")}</p>;

  return (
    <div>
      {editable && <p className="mb-3 text-xs text-muted">{t("check.transcriptHint")}</p>}
      <ol className="space-y-1">
        {segments.map((segment) => {
          const isActive = segment.id === activeId;
          const isEditing = editing === segment.id;
          return (
            <li
              key={segment.id}
              ref={isActive ? activeRef : undefined}
              className={cn("group rounded-md px-2.5 py-2 transition-colors", isActive ? "bg-accent-soft/60" : "hover:bg-surface-sunken/60")}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                {segment.start_ms !== null ? (
                  <button type="button" onClick={() => onSeek?.(segment.start_ms!)} className="num font-medium text-accent hover:underline">
                    {formatDuration(segment.start_ms)}
                  </button>
                ) : (
                  <span className="num">{t("check.paragraph", { n: segment.idx + 1 })}</span>
                )}
                {segment.speaker && <span>{segment.speaker}</span>}
                {segment.low_confidence && (
                  <span className="inline-flex items-center gap-1 text-context-text">
                    <Icon name="alert" size={12} />
                    {t("check.lowConfidence")}
                  </span>
                )}
                {segment.edited_at && <span className="text-subtle">· {t("check.edited")}</span>}
                {editable && !isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(segment.id);
                      setDraft(segment.text);
                    }}
                    aria-label={t("common.edit")}
                    className="ms-auto rounded-sm p-1 opacity-0 group-hover:opacity-100 hover:bg-surface focus:opacity-100"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 60)))}
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditing(null);
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(segment);
                    }}
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      {t("common.cancel")}
                    </Button>
                    <Button size="sm" variant="primary" loading={pending} onClick={() => save(segment)}>
                      {t("check.saveSegment")}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-[15px] leading-relaxed">
                  <HighlightedText text={segment.text} spans={spansFor(segment.id, claims)} selectedId={selectedId} onSelect={onSelectClaim} />
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
