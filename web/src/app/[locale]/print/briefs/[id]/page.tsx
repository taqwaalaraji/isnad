import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AutoPrint } from "@/features/briefs/brief-controls";
import { BriefSheet } from "@/features/briefs/brief-sheet";
import { getBrief } from "@/features/briefs/queries";
import { requireNewsroom } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { robots: { index: false } };

type Props = PageProps<"/[locale]/print/briefs/[id]">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The brief alone, without the app's chrome, for printing or saving as PDF. */
async function Content({ params }: Props) {
  const { locale: raw, id } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [viewer, t] = await Promise.all([requireNewsroom(locale), getT(locale)]);
  if (!UUID.test(id)) notFound();
  const brief = await getBrief(id);
  if (!brief || brief.status !== "ready") notFound();
  return (
    <>
      <BriefSheet brief={brief} locale={locale} t={t} newsroomName={viewer.active.newsroomName} />
      <AutoPrint />
    </>
  );
}

export default function PrintBriefPage(props: Props) {
  return (
    <main className="mx-auto max-w-3xl bg-bg p-6 print:max-w-none print:p-0">
      <Suspense>
        <Content {...props} />
      </Suspense>
    </main>
  );
}
