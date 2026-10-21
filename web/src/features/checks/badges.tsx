import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import { ChainMark, Nuqta } from "@/components/ui/nuqta";
import type { Translate } from "@/lib/i18n/translate";
import type { CheckStatus, InputKind, Verdict } from "@/lib/types";

const VERDICT_TONE = { match: "match", context: "context", differs: "differs", none: "none" } as const;

export function VerdictBadge({ verdict, t, short, size }: { verdict: Verdict; t: Translate; short?: boolean; size?: "sm" | "md" }) {
  return (
    <Badge tone={VERDICT_TONE[verdict]} nuqta={VERDICT_TONE[verdict]} size={size}>
      {short ? t(`verdict.short.${verdict}`) : t(`verdict.${verdict}`)}
    </Badge>
  );
}

const STATUS_ICON: Record<CheckStatus, IconName> = {
  processing: "refresh",
  awaiting_review: "clock",
  in_review: "edit",
  escalated: "flag",
  approved: "check",
  published: "globe",
  archived: "archive",
  failed: "alert",
};

const STATUS_STYLE: Record<CheckStatus, string> = {
  processing: "bg-accent-soft text-accent",
  awaiting_review: "border border-accent text-accent bg-surface",
  in_review: "bg-surface-sunken text-text",
  escalated: "border border-border-strong text-text bg-surface",
  approved: "bg-ink text-paper dark:bg-paper dark:text-ink",
  published: "bg-accent text-on-accent",
  archived: "bg-surface-sunken text-muted",
  failed: "bg-differ-tint text-differ-text",
};

/** Workflow status: ink and lapis with an icon (verdict colours are reserved for verdicts). */
export function StatusBadge({ status, t }: { status: CheckStatus; t: Translate }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_STYLE[status])}>
      <Icon name={STATUS_ICON[status]} size={14} className={status === "processing" ? "animate-spin [animation-duration:2s]" : ""} />
      {t(`status.${status}`)}
    </span>
  );
}

export const KIND_ICON: Record<InputKind, IconName> = {
  video: "video",
  audio: "mic",
  document: "file",
  text: "text",
  link: "link",
};

export function VerdictCounts({
  counts,
  className,
}: {
  counts: { match: number; context: number; differs: number; none: number };
  className?: string;
}) {
  const items = [
    ["match", counts.match],
    ["context", counts.context],
    ["differs", counts.differs],
    ["none", counts.none],
  ] as const;
  return (
    <span className={cn("num inline-flex items-center gap-2.5 text-xs text-muted", className)}>
      {items.map(([tone, n]) => (
        <span key={tone} className={cn("inline-flex items-center gap-1", n === 0 && "opacity-40")}>
          <Nuqta tone={tone === "differs" ? "differs" : tone} size={6} />
          {n}
        </span>
      ))}
    </span>
  );
}

export function ChainStatus({ connected, t, className }: { connected: boolean; t: Translate; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", connected ? "text-accent" : "text-none-text", className)}>
      <ChainMark connected={connected} />
      {connected ? t("chain.connected") : t("chain.broken")}
    </span>
  );
}
