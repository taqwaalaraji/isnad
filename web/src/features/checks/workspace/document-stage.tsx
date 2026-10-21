"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { Nuqta } from "@/components/ui/nuqta";
import { useI18n } from "@/lib/i18n/provider";
import type { Verdict } from "@/lib/types";

import { HighlightedText, spansFor } from "./highlight";
import type { WorkspaceClaim, WorkspaceSegment } from "./types";

const RANK: Record<Verdict, number> = { differs: 0, context: 1, none: 2, match: 3 };

/** The worst verdict among a paragraph's numbers, for its margin marker. */
function paragraphVerdict(claims: WorkspaceClaim[]): Verdict | null {
  let worst: Verdict | null = null;
  for (const claim of claims) {
    const verdict: Verdict | undefined = claim.result?.verdict;
    if (verdict && (worst === null || RANK[verdict] < RANK[worst])) worst = verdict;
  }
  return worst;
}

export function DocumentStage({
  title,
  meta,
  segments,
  claims,
  selectedId,
  onSelectClaim,
  originalUrl,
}: {
  title: string;
  meta: string;
  segments: WorkspaceSegment[];
  claims: WorkspaceClaim[];
  selectedId: string | null;
  onSelectClaim: (id: string) => void;
  originalUrl?: string | null;
}) {
  const { t } = useI18n();
  const selected = claims.find((c) => c.id === selectedId);
  const refs = useRef(new Map<string, HTMLParagraphElement>());

  useEffect(() => {
    if (!selected?.segment_id) return;
    refs.current.get(selected.segment_id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected?.segment_id]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-2.5 text-xs text-muted">
        <span className="num truncate">{meta}</span>
        <div className="flex items-center gap-1">
          {originalUrl && (
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("check.openOriginal")}
              title={t("check.openOriginal")}
              className="rounded-sm p-1.5 hover:bg-surface-sunken hover:text-text"
            >
              <Icon name="external" size={16} />
            </a>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            aria-label={t("check.print")}
            title={t("check.print")}
            className="rounded-sm p-1.5 hover:bg-surface-sunken hover:text-text"
          >
            <Icon name="printer" size={16} />
          </button>
        </div>
      </div>
      <article className="flex-1 overflow-y-auto px-6 py-6 sm:px-10">
        <h2 className="mb-6 text-2xl leading-snug font-bold">{title}</h2>
        <div className="space-y-4">
          {segments.map((segment) => {
            const inside = claims.filter((c) => c.segment_id === segment.id);
            const verdict = paragraphVerdict(inside);
            const active = selected?.segment_id === segment.id;
            return (
              <p
                key={segment.id}
                ref={(el) => {
                  if (el) refs.current.set(segment.id, el);
                  else refs.current.delete(segment.id);
                }}
                className={cn(
                  "relative rounded-md px-3 py-2 text-[17px] leading-loose transition-colors",
                  active ? "bg-accent-soft/50" : inside.length > 0 && "hover:bg-surface-sunken/60",
                )}
              >
                {inside.length > 0 && (
                  <span className="absolute -start-3 top-4">
                    <Nuqta tone={verdict ?? "muted"} size={8} />
                  </span>
                )}
                {segment.page && <span className="num me-2 text-xs text-subtle">{t("check.page", { n: segment.page })}</span>}
                <HighlightedText text={segment.text} spans={spansFor(segment.id, claims)} selectedId={selectedId} onSelect={onSelectClaim} />
              </p>
            );
          })}
        </div>
      </article>
    </div>
  );
}
