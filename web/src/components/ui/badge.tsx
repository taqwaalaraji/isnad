import type { ReactNode } from "react";

import { cn } from "./cn";
import { Icon, type IconName } from "./icon";
import { Nuqta, type NuqtaTone } from "./nuqta";

type Tone = "neutral" | "accent" | "match" | "context" | "differs" | "none" | "ink" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-muted",
  accent: "bg-accent-soft text-accent",
  match: "bg-match-tint text-match-text",
  context: "bg-context-tint text-context-text",
  differs: "bg-differ-tint text-differ-text",
  none: "bg-none-tint text-none-text",
  ink: "bg-ink text-paper dark:bg-paper dark:text-ink",
  outline: "border border-border text-muted",
};

export function Badge({
  tone = "neutral",
  icon,
  nuqta,
  children,
  className,
  size = "md",
}: {
  tone?: Tone;
  icon?: IconName;
  nuqta?: NuqtaTone;
  children: ReactNode;
  className?: string;
  size?: "md" | "sm";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs",
        tones[tone],
        className,
      )}
    >
      {nuqta && <Nuqta tone={nuqta} size={6} />}
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}
