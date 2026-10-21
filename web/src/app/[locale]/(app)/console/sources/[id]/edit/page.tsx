import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SetBreadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader, Skeleton } from "@/components/ui/card";
import { ACCESS_METHODS, FREQUENCIES, oneOf, SOURCE_TYPES, someOf } from "@/features/console/constants";
import { isUuid } from "@/features/console/domains";
import { formOptions, getSource } from "@/features/console/queries";
import { SourceForm } from "@/features/console/sources/source-form";
import { requireStaff } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

type Props = PageProps<"/[locale]/console/sources/[id]/edit">;

async function Content({ params }: { params: Props["params"] }) {
  const { locale: raw, id } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [, t] = await Promise.all([requireStaff(locale), getT(locale)]);
  if (!isUuid(id)) notFound();
  const [source, options] = await Promise.all([getSource(id), formOptions()]);
  if (!source || source.newsroom_id) notFound();
  const name = locale === "ar" ? source.name_ar : source.name_en;
  return (
    <>
      <SetBreadcrumbs
        items={[
          { label: t("console.sources.title"), href: `/${locale}/console/sources` },
          { label: name, href: `/${locale}/console/sources/${id}` },
          { label: t("console.sources.edit") },
        ]}
      />
      <PageHeader title={t("console.sources.editTitle")} subtitle={name} />
      <div className="max-w-4xl">
        <SourceForm
          options={options}
          initial={{
            id: source.id,
            entityId: source.entity_id,
            nameAr: source.name_ar,
            nameEn: source.name_en,
            slug: source.slug,
            tier: source.tier,
            type: oneOf(SOURCE_TYPES, source.type) ?? "publications",
            homepageUrl: source.homepage_url ?? "",
            dataUrl: source.data_url ?? "",
            domains: source.domains,
            accessMethods: someOf(ACCESS_METHODS, source.access_methods),
            updateFrequency: oneOf(FREQUENCIES, source.update_frequency),
            languages: someOf(["ar", "en"] as const, source.languages),
            topicIds: source.source_topics.map((st) => st.topic_id),
            descriptionAr: source.description_ar ?? "",
            descriptionEn: source.description_en ?? "",
            termsUrl: source.terms_url ?? "",
          }}
        />
      </div>
    </>
  );
}

export default function EditSourcePage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px] w-full max-w-4xl rounded-lg" />}>
      <Content params={params} />
    </Suspense>
  );
}
