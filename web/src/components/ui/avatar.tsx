import { cn } from "./cn";

const palette = ["bg-accent-soft text-accent", "bg-match-tint text-match-text", "bg-context-tint text-context-text", "bg-none-tint text-none-text"];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const initial = name.trim().charAt(0) || "؟";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        palette[hash(name) % palette.length],
        className,
      )}
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  );
}
