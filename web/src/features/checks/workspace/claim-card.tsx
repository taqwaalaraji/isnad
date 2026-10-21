"use client";

import { forwardRef } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { ChainStatus, VerdictBadge } from "../badges";
import type { WorkspaceClaim } from "./types";

/** A number past the check's search budget (or queued for search): no verdict yet. */
export function notSearched(comparison: unknown): boolean {
  const search = (comparison as { search?: string } | null)?.search;
  return search === "skipped" || search === "queued";
}

export function claimLocation(claim: WorkspaceClaim, segmentIdx: number | undefined, t: ReturnType<typeof useI18n>["t"]): string {
  if (claim.start_ms !== null && claim.start_ms !== undefined) return formatDuration(claim.start_ms);
  if (segmentIdx !== undefined) return t("check.paragraph", { n: segmentIdx + 1 });
  return t("check.claimNumber", { n: claim.idx + 1 });
}

export const ClaimCard = forwardRef<
  HTMLButtonElement,
  { claim: WorkspaceClaim; selected: boolean; active: boolean; segmentIdx?: number; onSelect: () => void }
>(function ClaimCard({ claim, selected, active, segmentIdx, onSelect }, ref) {
  const { t } = useI18n();
  const result = claim.result;
  const state = claim.review_state;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-md border bg-surface p-3.5 text-start transition-[border-color,box-shadow]",
        selected ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-border hover:border-border-strong",
        active && !selected && "border-accent/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {!result ? (
          <span className="h-5 w-20 animate-pulse rounded-full bg-surface-sunken" />
        ) : result.verdict === "none" && notSearched(result.comparison) ? (
          <Badge tone="outline" icon="search" size="sm">
            {t("check.notSearched")}
          </Badge>
        ) : (
          <VerdictBadge verdict={result.verdict} t={t} size="sm" />
        )}
        <span className="num text-xs text-muted">{claimLocation(claim, segmentIdx, t)}</span>
      </div>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed font-medium text-text">«{claim.span_text}»</p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {result ? <ChainStatus connected={result.chain_status === "connected"} t={t} /> : <span />}
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {result?.needs_review && <Icon name="alert" size={14} className="text-context-text" aria-label={t("check.verifierNote")} />}
          {state !== "pending" ? (
            <span className={cn("inline-flex items-center gap-1", state === "escalated" ? "text-differ-text" : "text-match-text")}>
              <Icon name={state === "escalated" ? "flag" : state === "edited" ? "edit" : "check"} size={14} />
              {t(`check.reviewState.${state}`)}
            </span>
          ) : (
            claim.speaker && <span className="truncate">{claim.speaker}</span>
          )}
        </span>
      </div>
    </button>
  );
});
