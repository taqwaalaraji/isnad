import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { formatDuration, formatRelative } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/translate";

import { KIND_ICON, StatusBadge, VerdictCounts } from "./badges";
import type { CheckListRow } from "./queries";

export function CheckTable({ rows, t, locale, showOwner = true }: { rows: CheckListRow[]; t: Translate; locale: Locale; showOwner?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-start text-xs text-muted">
            <th className="px-5 py-3 text-start font-medium">{t("checks.columns.title")}</th>
            <th className="px-3 py-3 text-start font-medium">{t("checks.columns.type")}</th>
            <th className="px-3 py-3 text-start font-medium">{t("checks.columns.status")}</th>
            <th className="px-3 py-3 text-start font-medium">{t("checks.columns.results")}</th>
            {showOwner && <th className="px-3 py-3 text-start font-medium">{t("checks.columns.owner")}</th>}
            <th className="px-5 py-3 text-start font-medium">{t("checks.columns.date")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = `/${locale}/checks/${row.id}`;
            const duration = row.media?.duration_ms;
            const subtitle = [
              row.claim_count ? t("checks.claimsCount", { n: row.claim_count }) : null,
              row.desk?.name,
              t(`inputKind.${row.input_kind}`),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <tr key={row.id} className="group border-b border-border last:border-0 hover:bg-surface-sunken/60">
                <td className="px-5 py-3">
                  <Link href={href} className="block font-semibold text-text group-hover:text-accent">
                    {row.title}
                  </Link>
                  <span className="mt-0.5 block text-xs text-muted">{subtitle}</span>
                </td>
                <td className="px-3 py-3 text-muted">
                  <span className="num inline-flex items-center gap-1.5">
                    <Icon name={KIND_ICON[row.input_kind]} size={16} />
                    {duration ? formatDuration(duration) : null}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={row.status} t={t} />
                </td>
                <td className="px-3 py-3">
                  {row.status === "processing" || row.status === "failed" ? (
                    <span className="text-xs text-subtle">—</span>
                  ) : (
                    <VerdictCounts
                      counts={{ match: row.match_count, context: row.context_count, differs: row.differs_count, none: row.none_count }}
                    />
                  )}
                </td>
                {showOwner && (
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2 text-muted">
                      <Avatar name={row.owner?.full_name ?? "?"} size={24} />
                      <span className="truncate">{row.owner?.full_name}</span>
                    </span>
                  </td>
                )}
                <td className="px-5 py-3 text-xs whitespace-nowrap text-muted">{formatRelative(row.created_at, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
