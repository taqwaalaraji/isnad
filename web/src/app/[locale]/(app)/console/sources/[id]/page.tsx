import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { HealthBadge, inboxState, InboxStateBadge, TierBadge } from "@/features/console/badges";
import { isUuid } from "@/features/console/domains";
import { getSource, sourceDocuments } from "@/features/console/queries";
import { AddDocument } from "@/features/console/sources/add-document";
import { SourceActions } from "@/features/console/sources/source-actions";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatRelative } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { createClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/console/sources/[id]">;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

async function Content({ params, searchParams }: Props) {
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [, t] = await Promise.all([requireStaff(locale), getT(locale)]);
  if (!isUuid(id)) notFound();
  const [source, documents] = await Promise.all([getSource(id), sourceDocuments(id)]);
  if (!source) notFound();

  // Pending figures per current version, to show what still needs review.
  const versionIds = documents.map((d) => d.current?.id).filter((v): v is string => !!v);
  const pending = new Map<string, number>();
  if (versionIds.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("figures").select("document_version_id").in("document_version_id", versionIds).eq("review_status", "pending").limit(5000);
    for (const row of data ?? []) pending.set(row.document_version_id, (pending.get(row.document_version_id) ?? 0) + 1);
  }

  const name = locale === "ar" ? source.name_ar : source.name_en;
  const entity = source.entity ? (locale === "ar" ? source.entity.name_ar : source.entity.name_en) : null;
  const link = (url: string | null) =>
    url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-accent hover:underline">
        {url}
      </a>
    ) : (
      "—"
    );

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("console.sources.title"), href: `/${locale}/console/sources` }, { label: name }]} />
      {query.created === "1" && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-md bg-match-tint px-4 py-3 text-sm text-match-text">
          <Icon name="check" size={16} />
          {t("console.sources.created")}
        </div>
      )}
      <PageHeader
        title={name}
        subtitle={[entity, source.domains.join(" · ")].filter(Boolean).join(" · ")}
        badge={
          <span className="flex items-center gap-2">
            <TierBadge tier={source.tier} t={t} />
            <HealthBadge health={source.health} t={t} />
            {source.status !== "active" && (
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted">{t(`console.sources.statusStates.${source.status}`)}</span>
            )}
          </span>
        }
        actions={source.newsroom_id ? undefined : <SourceActions id={source.id} status={source.status} />}
      />
      {source.health_note && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-md border border-border bg-surface-sunken px-4 py-3 text-sm">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-context-text" />
          <p dir="auto">{source.health_note}</p>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader
            title={t("console.sources.detail.documents")}
            description={source.last_fetched_at ? `${t("console.sources.lastFetched")}: ${formatRelative(source.last_fetched_at, locale)}` : t("console.sources.never")}
            action={!source.newsroom_id && <AddDocument sourceId={source.id} domains={source.domains} disabled={source.status === "rejected"} />}
          />
          {documents.length === 0 ? (
            <EmptyState icon={<Icon name="file" size={28} />} title={t("console.sources.detail.noDocuments")} />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {documents.map((doc) => {
                const version = doc.current;
                const state = version ? inboxState(version.extraction_status, pending.get(version.id) ?? 0) : "pending";
                return (
                  <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-muted">
                      <Icon name={doc.kind === "xlsx" || doc.kind === "csv" ? "table" : "file"} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" dir="auto">
                        {doc.title}
                      </p>
                      <p className="num truncate text-xs text-muted">
                        {[
                          doc.kind.toUpperCase(),
                          version ? t("console.sources.detail.version", { n: version.version }) : null,
                          version ? formatDate(version.fetched_at, locale) : null,
                          version?.figures_count ? t("console.sources.detail.figures", { n: version.figures_count }) : null,
                          doc.watch && doc.url ? t("console.sources.detail.watched") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <InboxStateBadge state={state} t={t} />
                    {version && state === "review" && (
                      <Link href={`/${locale}/console/review?version=${version.id}`} className="text-xs font-medium text-accent hover:underline">
                        {t("console.inbox.review")}
                      </Link>
                    )}
                    {doc.url && (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" aria-label={t("console.review.openOriginal")} className="rounded-sm p-1 text-muted hover:bg-surface-sunken hover:text-text">
                        <Icon name="external" size={16} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="h-fit p-5">
          <h2 className="mb-2 text-[15px] font-semibold">{t("console.sources.detail.about")}</h2>
          <dl className="divide-y divide-border">
            <Row label={t("console.sources.entity")}>{entity ?? "—"}</Row>
            <Row label={t("console.sources.type")}>{t(`console.sources.types.${source.type}` as MessageKey)}</Row>
            <Row label={t("console.sources.domains")}>
              <span dir="ltr">{source.domains.join(", ")}</span>
            </Row>
            <Row label={t("console.sources.access")}>
              {source.access_methods.map((m) => t(`console.sources.accessMethods.${m}` as MessageKey)).join(" · ") || "—"}
            </Row>
            <Row label={t("console.sources.frequency")}>
              {source.update_frequency ? t(`console.sources.frequencies.${source.update_frequency}` as MessageKey) : "—"}
            </Row>
            <Row label={t("console.sources.languages")}>{source.languages.map((l) => t(`console.sources.languageNames.${l}` as MessageKey)).join(" · ")}</Row>
            <Row label={t("console.sources.homepage")}>{link(source.homepage_url)}</Row>
            <Row label={t("console.sources.dataUrl")}>{link(source.data_url)}</Row>
            <Row label={t("console.sources.termsUrl")}>{link(source.terms_url)}</Row>
          </dl>
          {(locale === "ar" ? source.description_ar : source.description_en) && (
            <p className="mt-3 text-sm text-muted">{locale === "ar" ? source.description_ar : source.description_en}</p>
          )}
        </Card>
      </div>
    </>
  );
}

export default function SourcePage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-[480px] w-full rounded-lg" />
        </div>
      }
    >
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}
