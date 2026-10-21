import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import type { Translate } from "@/lib/i18n/translate";
import type { Database } from "@/lib/database.types";

type Health = Database["public"]["Enums"]["source_health"];
type Extraction = Database["public"]["Enums"]["extraction_status"];

/** Trust tier: the origin and issuers in lapis, relays neutral. */
export function TierBadge({ tier, t }: { tier: number; t: Translate }) {
  const key = String(tier) as "1" | "2" | "3";
  return (
    <Badge tone={tier === 3 ? "outline" : tier === 1 ? "accent" : "neutral"} size="sm">
      {t(`tier.${key}`)}
    </Badge>
  );
}

const HEALTH: Record<Health, { icon: IconName; style: string }> = {
  healthy: { icon: "check", style: "border-border text-text" },
  warning: { icon: "alert", style: "border-context/40 bg-context-tint text-context-text" },
  failing: { icon: "circle-x", style: "border-differ/40 bg-differ-tint text-differ-text" },
  unknown: { icon: "circle-dot", style: "border-border text-muted" },
};

export function HealthBadge({ health, t }: { health: Health; t: Translate }) {
  const { icon, style } = HEALTH[health];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", style)}>
      <Icon name={icon} size={12} />
      {t(`console.sources.healthStates.${health}`)}
    </span>
  );
}

export type InboxState = "pending" | "extracting" | "review" | "approved" | "failed" | "unchanged";

/** The inbox state of a document version: its extraction status, refined by figures still awaiting review. */
export function inboxState(status: Extraction, pendingFigures: number): InboxState {
  if (status === "extracted") return pendingFigures > 0 ? "review" : "approved";
  return status;
}

const STATE: Record<InboxState, { icon: IconName; style: string }> = {
  pending: { icon: "clock", style: "bg-surface-sunken text-muted" },
  extracting: { icon: "refresh", style: "bg-accent-soft text-accent" },
  review: { icon: "clock", style: "border border-accent bg-surface text-accent" },
  approved: { icon: "check", style: "bg-ink text-paper dark:bg-paper dark:text-ink" },
  failed: { icon: "alert", style: "bg-differ-tint text-differ-text" },
  unchanged: { icon: "archive", style: "bg-surface-sunken text-muted" },
};

export function InboxStateBadge({ state, t }: { state: InboxState; t: Translate }) {
  const { icon, style } = STATE[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", style)}>
      <Icon name={icon} size={12} className={state === "extracting" ? "animate-spin [animation-duration:2s]" : ""} />
      {t(`console.inbox.states.${state}`)}
    </span>
  );
}
