import Link from "next/link";

import { cn } from "@/components/ui/cn";

/** Filter pills with counts, as links (the filter lives in the URL). */
export function FilterChips<T extends string>({
  items,
  active,
  hrefFor,
  label,
}: {
  items: Array<{ value: T; label: string; count?: number }>;
  active: T;
  hrefFor: (value: T) => string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => {
        const on = item.value === active;
        return (
          <Link
            key={item.value}
            href={hrefFor(item.value)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
              on ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-border bg-surface text-text hover:border-border-strong",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn("num rounded-full px-1.5 text-xs", on ? "bg-white/15" : "bg-surface-sunken text-muted")}>{item.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Build list URLs that keep the other query parameters. */
export function listHref(base: string, current: Record<string, string | undefined>, next: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...next })) if (v !== undefined && v !== "") search.set(k, String(v));
  const s = search.toString();
  return s ? `${base}?${s}` : base;
}
