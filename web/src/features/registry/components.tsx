import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import { Nuqta } from "@/components/ui/nuqta";
import { Sparkline } from "@/components/ui/sparkline";
import { formatRelative } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { MessageKey, Translate } from "@/lib/i18n/translate";

import { compactFigure, periodText } from "./format";

const TOPIC_ICONS = new Set<string>(["layers", "shield", "building", "home", "settings", "system", "chart", "grid", "send", "sparkles", "brief", "users", "globe", "activity", "tag"]);

export function topicIcon(icon: string | null | undefined): IconName {
  return (icon && TOPIC_ICONS.has(icon) ? icon : "chart") as IconName;
}

export function TierBadge({ tier, t, short }: { tier: number; t: Translate; short?: boolean }) {
  const key = String(Math.min(3, Math.max(1, tier))) as "1" | "2" | "3";
  return (
    <Badge tone={key === "3" ? "outline" : "accent"} size="sm">
      {short ? t(`tier.short${key}`) : t(`tier.${key}`)}
    </Badge>
  );
}

/** Figure status: revised figures stand out in lapis; others stay neutral. */
export function StatusPill({ status, t }: { status: "preliminary" | "final" | "revised"; t: Translate }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-sm px-2 py-0.5 text-xs whitespace-nowrap",
        status === "revised" ? "bg-accent-soft text-accent" : "bg-surface-sunken text-text",
      )}
    >
      {t(`registry.figureStatus.${status}`)}
    </span>
  );
}

export function TopicTile({ icon }: { icon: string | null | undefined }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
      <Icon name={topicIcon(icon)} size={18} />
    </span>
  );
}

const GEOGRAPHIES = new Set(["UAE", "Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah", "GCC", "World", "Other"]);

export function geoLabel(geography: string | null | undefined, t: Translate): string {
  if (!geography) return "";
  return GEOGRAPHIES.has(geography) ? t(`registry.geo.${geography}` as MessageKey) : geography;
}

export function frequencyLabel(frequency: string | null | undefined, t: Translate): string | null {
  if (!frequency) return null;
  const key = `registry.frequency.${frequency}` as MessageKey;
  const label = t(key);
  return label === key ? frequency : label;
}

/** A row in "latest figures" and topic lists: indicator, scope, value, period, trend, tier. */
export function IndicatorRow({
  href,
  name,
  meta,
  figure,
  series,
  tier,
  locale,
  t,
}: {
  href: string;
  name: string;
  meta: string;
  figure: { value: number | string; scale: string; decimals: number; unit: string; period_start: string; period_end: string } | null;
  series: number[];
  tier: number | null;
  locale: Locale;
  t: Translate;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-4 border-t border-border px-5 py-3.5 transition-colors first:border-t-0 hover:bg-surface-sunken/50">
        <Nuqta tone="accent" size={7} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted">{meta}</p>
        </div>
        {tier !== null && (
          <span className="hidden sm:inline-flex">
            <TierBadge tier={tier} t={t} />
          </span>
        )}
        <div className="w-28 shrink-0 text-end">
          {figure ? (
            <>
              <p className="num text-base font-semibold">{compactFigure(figure, locale)}</p>
              <p className="truncate text-xs text-muted">{periodText(figure.period_start, figure.period_end, locale)}</p>
            </>
          ) : (
            <p className="text-xs text-subtle">{t("registry.noFiguresYet")}</p>
          )}
        </div>
        <Sparkline values={series} width={88} height={28} className="hidden shrink-0 md:block" />
      </Link>
    </li>
  );
}

/** "Updated 3 hours ago" with a never-fetched fallback. */
export function UpdatedAt({ value, locale, t }: { value: string | null | undefined; locale: Locale; t: Translate }) {
  return <>{value ? formatRelative(value, locale) : t("registry.never")}</>;
}

export function SideCard({ title, count, action, children, className }: { title: ReactNode; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface p-5 shadow-card", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          {title}
          {count !== undefined && <span className="num rounded-full bg-surface-sunken px-2 text-xs font-normal text-muted">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
