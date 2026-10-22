import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { KIND_ICON, StatusBadge } from "@/features/checks/badges";
import { getCheckDetail, newsroomDesks, newsroomEditors } from "@/features/checks/queries";
import { CheckActions } from "@/features/checks/workspace/check-actions";
import { CheckRealtime } from "@/features/checks/workspace/check-realtime";
import { CheckWorkspace } from "@/features/checks/workspace/check-workspace";
import { ProcessingView } from "@/features/checks/workspace/processing-view";
import type { Capabilities } from "@/features/checks/workspace/types";
import { requireNewsroom } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatDate, formatDuration, formatRelative } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = PageProps<"/[locale]/checks/[id]">;

async function Content({ params, searchParams }: Props) {
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [viewer, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  const claim = typeof query.claim === "string" ? query.claim : undefined;
  if (!UUID.test(id)) notFound();
  const detail = await getCheckDetail(id);
  if (!detail) notFound();
  const { check, media } = detail;

  // Capabilities follow the viewer's role in the check's newsroom (it may differ from the active one).
  const membership = viewer.memberships.find((m) => m.newsroomId === check.newsroom_id);
  const decides = membership?.role === "editor" || membership?.role === "admin";
  const caps: Capabilities = {
    canDecide: decides,
    canEdit: decides || check.created_by === viewer.id,
    viewerId: viewer.id,
  };
  const [editors, desks] = caps.canEdit
    ? await Promise.all([newsroomEditors(check.newsroom_id).then((all) => all.filter((e) => e.id !== viewer.id || decides)), newsroomDesks(check.newsroom_id)])
    : [[], []];
  const processing = check.status === "processing" || check.status === "failed";

  const meta = [
    check.owner?.full_name,
    check.desk?.name,
    t(`inputKind.${check.input_kind}`),
    media?.duration_ms ? formatDuration(media.duration_ms) : null,
    t("check.recordedOn", { date: formatDate(check.recorded_at, locale) }),
    formatRelative(check.created_at, locale),
  ].filter(Boolean);

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("nav.checks"), href: `/${locale}/checks` }, { label: check.title }]} />
      <CheckRealtime checkId={check.id} />
      <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl leading-tight font-bold">{check.title}</h1>
            <StatusBadge status={check.status} t={t} />
          </div>
          <p className="num mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <Icon name={KIND_ICON[check.input_kind]} size={14} />
            {meta.join(" · ")}
            {check.editor && <span>· {t("check.assignedTo", { name: check.editor.full_name })}</span>}
          </p>
          {check.status === "published" && check.published_url && (
            <a href={check.published_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">
              <Icon name="globe" size={12} />
              <span dir="ltr" className="max-w-[420px] truncate">{check.published_url}</span>
            </a>
          )}
        </div>
        {!processing || check.status === "failed" ? (
          <CheckActions detail={detail} caps={caps} editors={editors} desks={desks} siteUrl={env.siteUrl} />
        ) : null}
      </header>
      {processing ? <ProcessingView detail={detail} caps={caps} /> : <CheckWorkspace detail={detail} caps={caps} initialClaim={claim} />}
    </>
  );
}

export default function CheckPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<CheckSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function CheckSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-80" />
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Skeleton className="h-[520px] rounded-lg" />
        <Skeleton className="h-[520px] rounded-lg" />
      </div>
    </div>
  );
}
