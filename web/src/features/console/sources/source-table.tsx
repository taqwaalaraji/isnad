import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { formatNumber, formatRelative } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translate";

import { HealthBadge, TierBadge } from "../badges";
import type { SourceListRow } from "../queries";
import { SourceRowMenu } from "./source-row-menu";

export function SourceTable({ rows, t, locale }: { rows: SourceListRow[]; t: Translate; locale: Locale }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-sunken/50 text-xs text-muted">
            <th className="px-5 py-3 text-start font-medium">{t("console.sources.title")}</th>
            <th className="px-3 py-3 text-start font-medium">{t("console.sources.tier")}</th>
            <th className="px-3 py-3 text-start font-medium">{t("console.sources.access")}</th>
            <th className="px-3 py-3 text-end font-medium">{t("console.sources.figures")}</th>
            <th className="px-3 py-3 text-start font-medium">{t("console.sources.lastFetched")}</th>
            <th className="px-3 py-3 text-start font-medium">{t("console.sources.health")}</th>
            <th className="w-12 px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = `/${locale}/console/sources/${row.id}`;
            const methods = row.access_methods.map((m) => t(`console.sources.accessMethods.${m}` as Parameters<Translate>[0])).join(" · ");
            const frequency = row.update_frequency ? t(`console.sources.frequencies.${row.update_frequency}` as Parameters<Translate>[0]) : null;
            return (
              <tr key={row.id} className="group border-b border-border last:border-0 hover:bg-surface-sunken/60">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-muted">
                      <Icon name="building" size={18} />
                    </span>
                    <div className="min-w-0">
                      <Link href={href} className="block truncate font-semibold text-text group-hover:text-accent">
                        {locale === "ar" ? row.name_ar : row.name_en}
                      </Link>
                      <span className="block truncate text-xs text-muted" dir="ltr">
                        {row.domains.join(" · ")}
                      </span>
                    </div>
                    {row.status === "paused" && (
                      <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-muted">{t("console.sources.statusStates.paused")}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <TierBadge tier={row.tier} t={t} />
                </td>
                <td className="px-3 py-3 text-xs text-muted">{[methods, frequency].filter(Boolean).join(" · ") || "—"}</td>
                <td className="num px-3 py-3 text-end font-medium">{row.figureCount ? formatNumber(row.figureCount, locale) : "—"}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap text-muted">
                  {row.last_fetched_at ? formatRelative(row.last_fetched_at, locale) : t("console.sources.never")}
                </td>
                <td className="px-3 py-3">
                  <HealthBadge health={row.health} t={t} />
                </td>
                <td className="px-3 py-3">
                  <SourceRowMenu id={row.id} status={row.status} href={href} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
