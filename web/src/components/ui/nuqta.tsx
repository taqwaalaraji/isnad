import { cn } from "./cn";

export type NuqtaTone = "match" | "context" | "differs" | "none" | "accent" | "muted" | "ink";

const tones: Record<NuqtaTone, string> = {
  match: "bg-match",
  context: "bg-context",
  differs: "bg-differ",
  none: "bg-none",
  accent: "bg-accent",
  muted: "bg-subtle",
  ink: "bg-text",
};

/** The nuqta: the brand's only marker (a rhombus, like the dot of an Arabic letter). */
export function Nuqta({
  tone = "accent",
  size = 8,
  className,
}: {
  tone?: NuqtaTone;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rotate-45 rounded-[2px]", tones[tone], className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Three stacked nuqtas: the chain mark (connected = lapis, broken = slate with a gap). */
export function ChainMark({ connected, className }: { connected: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex flex-col items-center gap-[2px]", className)}>
      <Nuqta size={4} tone={connected ? "accent" : "none"} />
      <Nuqta size={4} tone={connected ? "accent" : "none"} className={connected ? "" : "opacity-30"} />
      <Nuqta size={4} tone={connected ? "accent" : "none"} />
    </span>
  );
}
