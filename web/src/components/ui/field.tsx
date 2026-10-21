import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";
import { Icon } from "./icon";

const control =
  "w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-subtle " +
  "transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-differ";

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-sm font-medium text-text", className)}>
      {children}
    </label>
  );
}

export function Hint({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="mt-1.5 text-xs text-muted">
      {children}
    </p>
  );
}

export function FieldError({ children, id }: { children?: ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-differ-text">
      <Icon name="alert" size={14} />
      {children}
    </p>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-10 appearance-none pe-9", className)} {...props}>
        {children}
      </select>
      <Icon
        name="chevron-down"
        size={16}
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <FieldError id={`${htmlFor}-error`}>{error}</FieldError> : hint ? <Hint id={`${htmlFor}-hint`}>{hint}</Hint> : null}
    </div>
  );
}

export function SearchInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <div className={cn("relative", className)}>
      <Icon name="search" size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
      <input type="search" className={cn(control, "h-10 ps-9")} {...props} />
    </div>
  );
}

export function Checkbox({ label, className, ...props }: { label: ReactNode } & ComponentProps<"input">) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-text", className)}>
      <input type="checkbox" className="size-4 rounded-xs border-border accent-[var(--accent)]" {...props} />
      {label}
    </label>
  );
}

export function Radio({ label, className, ...props }: { label: ReactNode } & ComponentProps<"input">) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-text", className)}>
      <input type="radio" className="size-4 accent-[var(--accent)]" {...props} />
      {label}
    </label>
  );
}
