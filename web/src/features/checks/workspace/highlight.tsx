"use client";

import { cn } from "@/components/ui/cn";
import type { Verdict } from "@/lib/types";

import type { WorkspaceClaim } from "./types";

export type Span = { id: string; start: number; end: number; verdict: Verdict | null };

const TONE: Record<Verdict | "pending", string> = {
  match: "bg-match-tint text-match-text decoration-match",
  context: "bg-context-tint text-context-text decoration-context",
  differs: "bg-differ-tint text-differ-text decoration-differ",
  none: "bg-none-tint text-none-text decoration-none",
  pending: "bg-surface-sunken text-text decoration-border-strong",
};

/** The claim spans that sit inside one segment, in text order. */
export function spansFor(segmentId: string, claims: WorkspaceClaim[]): Span[] {
  return claims
    .filter((c) => c.segment_id === segmentId && c.span_start !== null && c.span_end !== null)
    .map((c) => ({ id: c.id, start: c.span_start!, end: c.span_end!, verdict: c.result?.verdict ?? null }))
    .sort((a, b) => a.start - b.start);
}

/**
 * Text with its claim spans marked in their verdict colours. `from`/`to` render only a window of the text
 * (captions show one line at a time); spans are clipped to it.
 */
export function HighlightedText({
  text,
  spans,
  from = 0,
  to = text.length,
  selectedId,
  onSelect,
  className,
}: {
  text: string;
  spans: Span[];
  from?: number;
  to?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = from;
  for (const span of spans) {
    const start = Math.max(span.start, from);
    const end = Math.min(span.end, to);
    if (end <= start || start < cursor) continue;
    if (start > cursor) parts.push(text.slice(cursor, start));
    const tone = TONE[span.verdict ?? "pending"];
    const content = text.slice(start, end);
    parts.push(
      onSelect ? (
        <button
          key={span.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(span.id);
          }}
          className={cn(
            "num rounded-xs px-0.5 font-semibold underline decoration-2 underline-offset-4 transition-shadow",
            tone,
            selectedId === span.id && "ring-2 ring-accent",
          )}
        >
          {content}
        </button>
      ) : (
        <mark key={span.id} className={cn("num rounded-xs px-0.5 font-semibold", tone, selectedId === span.id && "ring-2 ring-accent")}>
          {content}
        </mark>
      ),
    );
    cursor = end;
  }
  if (cursor < to) parts.push(text.slice(cursor, to));
  return <span className={className}>{parts}</span>;
}
