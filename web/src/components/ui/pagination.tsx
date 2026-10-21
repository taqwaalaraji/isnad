import Link from "next/link";

import { cn } from "./cn";
import { Icon } from "./icon";

export function Pagination({
  page,
  total,
  pageSize,
  hrefFor,
  summary,
}: {
  page: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
  summary: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="px-5 py-3 text-xs text-muted">{summary}</p>;
  const visible = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <p className="text-xs text-muted">{summary}</p>
      <nav className="flex items-center gap-1" aria-label="pagination">
        <Link
          href={hrefFor(Math.max(1, page - 1))}
          aria-disabled={page === 1}
          className={cn("rounded-md border border-border p-1.5", page === 1 && "pointer-events-none opacity-40")}
        >
          <Icon name="chevron-right" size={16} className="ltr:rotate-180" />
        </Link>
        {visible.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && visible[i - 1] !== p - 1 && <span className="px-1 text-subtle">…</span>}
            <Link
              href={hrefFor(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn("num min-w-8 rounded-md px-2 py-1 text-center text-sm", p === page ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "hover:bg-surface-sunken")}
            >
              {p}
            </Link>
          </span>
        ))}
        <Link
          href={hrefFor(Math.min(pages, page + 1))}
          aria-disabled={page === pages}
          className={cn("rounded-md border border-border p-1.5", page === pages && "pointer-events-none opacity-40")}
        >
          <Icon name="chevron-left" size={16} className="ltr:rotate-180" />
        </Link>
      </nav>
    </div>
  );
}
