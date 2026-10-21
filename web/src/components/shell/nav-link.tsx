"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import { Nuqta } from "@/components/ui/nuqta";

export function NavLink({
  href,
  icon,
  label,
  count,
  exact,
  onNavigate,
}: {
  href: string;
  icon: IconName;
  label: string;
  count?: number;
  exact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={count ? `${label} (${count})` : label}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active ? "bg-nav-raised text-nav-text" : "text-nav-muted hover:bg-nav-raised/60 hover:text-nav-text",
      )}
    >
      <Icon name={icon} size={18} className={active ? "text-sky" : ""} />
      <span className="flex-1 truncate">{label}</span>
      {!!count && (
        <span className="num min-w-5 rounded-full bg-lapis px-1.5 text-center text-[11px] leading-5 font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
      {active && !count && <Nuqta size={6} className="!bg-sky" />}
    </Link>
  );
}

export function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-nav-muted/80">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
