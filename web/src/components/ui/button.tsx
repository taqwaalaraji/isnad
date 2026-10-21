import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

type Variant = "primary" | "secondary" | "ghost" | "inverse" | "danger";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors select-none " +
  "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover shadow-card",
  secondary: "bg-surface text-text border border-border hover:border-border-strong hover:bg-surface-sunken",
  ghost: "text-text hover:bg-surface-sunken",
  inverse: "bg-ink text-paper hover:bg-ink/90 dark:bg-paper dark:text-ink dark:hover:bg-paper/90",
  danger: "bg-surface text-differ-text border border-border hover:bg-differ-tint",
};

const sizes: Record<Size, string> = {
  md: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-[13px]",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconEnd?: IconName;
  loading?: boolean;
  children?: ReactNode;
};

function Content({ icon, iconEnd, loading, size, children }: CommonProps) {
  const iconSize = size === "sm" ? 16 : 18;
  return (
    <>
      {loading ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        icon && <Icon name={icon} size={iconSize} />
      )}
      {children}
      {iconEnd && <Icon name={iconEnd} size={iconSize} className="rtl:-scale-x-100" />}
    </>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconEnd,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: CommonProps & ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <Content icon={icon} iconEnd={iconEnd} loading={loading} size={size}>
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  iconEnd,
  className,
  children,
  ...props
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...props}>
      <Content icon={icon} iconEnd={iconEnd} size={size}>
        {children}
      </Content>
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  className,
  ...props
}: { icon: IconName; label: string; size?: Size; variant?: Variant } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        base,
        variants[variant],
        size === "sm" ? "size-8" : "size-10",
        "px-0",
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={size === "sm" ? 16 : 20} />
    </button>
  );
}
