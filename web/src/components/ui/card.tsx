import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-border bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({
  title,
  action,
  description,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        {icon && <span className="text-subtle">{icon}</span>}
      </div>
      <p className="num mt-2 text-[28px] leading-none font-semibold text-text">{value}</p>
      {detail && <div className="mt-2 text-xs text-muted">{detail}</div>}
    </Card>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-text md:text-[28px]">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 text-subtle">{icon}</div>}
      <p className="text-[15px] font-semibold text-text">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-sunken", className)} aria-hidden />;
}
