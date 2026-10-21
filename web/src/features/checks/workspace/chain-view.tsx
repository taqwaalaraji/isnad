"use client";

import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { Nuqta } from "@/components/ui/nuqta";
import { useI18n } from "@/lib/i18n/provider";
import type { ChainNode } from "@/lib/types";

/** Official document → relay → this content, with where the number changed. */
export function ChainView({ nodes, broken }: { nodes: ChainNode[]; broken: boolean }) {
  const { t, locale } = useI18n();
  return (
    <ol className="flex flex-wrap items-stretch gap-2" aria-label={t("check.chainTitle")}>
      {nodes.map((node, i) => {
        const changed = node.kind === "content" && (node.changes?.length ?? 0) > 0;
        const label = locale === "ar" ? node.label_ar : node.label_en;
        return (
          <li key={`${node.kind}-${i}`} className="flex items-center gap-2">
            {i > 0 && (
              <span className={cn("flex items-center", broken && i === 1 ? "text-none" : changed ? "text-context" : "text-accent")} aria-hidden>
                <span className={cn("h-px w-5", broken && i === 1 ? "border-t border-dashed border-current" : "bg-current")} />
                <Icon name="chevron-left" size={14} className="ltr:rotate-180" />
              </span>
            )}
            <div
              className={cn(
                "min-w-[132px] rounded-md border px-3 py-2 text-start",
                node.kind === "official" ? "border-accent bg-accent-soft/60" : node.kind === "unknown" ? "border-dashed border-border-strong" : "border-border",
                changed && "border-context bg-context-tint/50",
              )}
            >
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                {node.kind === "official" && <Nuqta size={6} />}
                {node.kind === "official" ? t("chain.official") : node.kind === "relay" ? t("chain.relay") : node.kind === "unknown" ? t("chain.unknownOrigin") : t("chain.thisContent")}
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold" title={label}>
                {label}
              </p>
              {node.value && (
                <p className="num mt-0.5 text-sm">
                  {node.value}
                  {node.period && <span className="ms-1 text-xs text-muted">· {node.period}</span>}
                </p>
              )}
              {node.tier && <p className="mt-1 text-[11px] text-muted">{t(`tier.short${node.tier as 1 | 2 | 3}`)}</p>}
              {changed && (
                <p className="mt-1 inline-flex rounded-full bg-context-tint px-2 py-0.5 text-[11px] font-medium text-context-text">
                  {node.changes!.map((c) => t(`differences.${c as "value" | "period" | "scope" | "unit"}`)).join(" · ")}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
