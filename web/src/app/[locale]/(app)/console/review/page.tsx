import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { Skeleton } from "@/components/ui/card";
import { catalogOptions, reviewFiles, reviewQueue, versionContexts } from "@/features/console/queries";
import { figureContext } from "@/features/console/review/context";
import { FilePicker } from "@/features/console/review/file-picker";
import { type ReviewItem, ReviewWorkspace } from "@/features/console/review/review-workspace";
import { isUuid } from "@/features/console/domains";
import { requireStaff } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/console/review">;

async function Content({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const [, t, params] = await Promise.all([requireStaff(locale), getT(locale), searchParams]);
  const files = await reviewFiles();
  // One file at a time: the one asked for, else the oldest waiting.
  const asked = typeof params.version === "string" && isUuid(params.version) ? params.version : undefined;
  const version = asked ?? files[0]?.id;
  const [{ figures, total }, catalog, contexts] = await Promise.all([
    version ? reviewQueue({ version }) : { figures: [], total: 0 },
    catalogOptions(),
    versionContexts(version ? [version] : []),
  ]);
  const items: ReviewItem[] = figures.map((f) => ({
    ...f,
    context: figureContext(contexts[f.document_version_id], (f.location ?? {}) as Record<string, never>, f.quote),
    versionNumber: contexts[f.document_version_id]?.version ?? null,
  }));
  const inboxHref = `/${locale}/console/inbox`;

  return (
    <>
      <SetBreadcrumbs items={[{ label: t("console.inbox.title"), href: inboxHref }, { label: t("console.review.title") }]} />
      {files.length > 1 && version && (
        <div className="mb-5">
          <FilePicker files={files} current={version} />
        </div>
      )}
      <ReviewWorkspace key={version ?? "none"} items={items} catalog={catalog} total={total} nextFile={files.find((f) => f.id !== version)?.id ?? null} />
    </>
  );
}

export default async function ReviewPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
            <Skeleton className="h-[520px] rounded-lg" />
            <Skeleton className="h-[520px] rounded-lg" />
          </div>
        </div>
      }
    >
      <Content locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}
