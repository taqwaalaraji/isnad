import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LocaleSwitch } from "@/components/shell/locale-switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Nuqta } from "@/components/ui/nuqta";
import { ChainStatus, VerdictBadge } from "@/features/checks/badges";
import { QuoteMark } from "@/features/checks/quote";
import { ChainView } from "@/features/checks/workspace/chain-view";
import { evidencePeriod, evidencePublisher } from "@/features/checks/workspace/labels";
import { periodText } from "@/features/registry/format";
import { formatDate, formatFigure } from "@/lib/format";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { ChainNode, Evidence, Verdict } from "@/lib/types";

type PublicClaim = {
  id: string;
  text: string;
  verdict: Verdict;
  chain_status: "connected" | "broken";
  chain: ChainNode[] | null;
  wording: string | null;
  evidence: Evidence | null;
  evidence_verified: boolean;
  document: { title: string; url: string | null; fetched_at: string | null } | null;
  revised: { value: number; scale: string; decimals: number; unit: string; period_label: string; period_start?: string; period_end?: string; at: string | null } | null;
};

type PublicNote = {
  title: string;
  newsroom: string;
  brand: boolean;
  published_url: string | null;
  published_at: string | null;
  recorded_at: string;
  claims: PublicClaim[];
};

const SLUG = /^[0-9a-f]{6,32}$/;

class NoteMissing extends Error {}

/**
 * Cached per slug for a few minutes; revisions show up on the next refresh. A missing note throws
 * (errors aren't cached), so a page published a moment ago isn't stuck as "not found".
 */
async function fetchNote(slug: string): Promise<PublicNote> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`public-note:${slug}`);
  const { data, error } = await createPublicClient().rpc("get_public_note", { slug });
  if (error) throw error;
  if (!data) throw new NoteMissing(slug);
  return data as PublicNote;
}

async function loadNote(slug: string): Promise<PublicNote | null> {
  try {
    return await fetchNote(slug);
  } catch (error) {
    if (error instanceof NoteMissing || (error instanceof Error && error.message === slug)) return null;
    throw error;
  }
}

type Props = PageProps<"/[locale]/n/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const note = SLUG.test(slug) ? await loadNote(slug) : null;
  if (!note) return {};
  const t = await getT(locale);
  return {
    title: `${t("publicNote.title")} · ${note.title}`,
    description: t("publicNote.verifiedWith", { newsroom: note.newsroom }),
    openGraph: { title: note.title, description: t("publicNote.verifiedWith", { newsroom: note.newsroom }), type: "article" },
  };
}

async function Note({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  if (!SLUG.test(slug)) notFound();
  const [note, t] = await Promise.all([loadNote(slug), getT(locale)]);
  if (!note) notFound();

  return (
    <>
      <div className="mb-8">
        <p className="text-xs text-muted">
          {[t("publicNote.pageLabel"), note.published_at && t("publicNote.publishedOn", { date: formatDate(note.published_at, locale) })]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <h1 className="mt-2 text-2xl leading-snug font-bold sm:text-3xl">{note.title}</h1>
        <p className="mt-2 text-sm text-muted">{t("publicNote.verifiedWith", { newsroom: note.newsroom })}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Badge tone="accent" size="sm">
            {t("publicNote.numbers", { n: note.claims.length })}
          </Badge>
          {note.published_url && (
            <a href={note.published_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
              <Icon name="external" size={14} />
              {t("publicNote.readOriginal")}
            </a>
          )}
        </div>
      </div>

      {note.claims.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">{t("publicNote.empty")}</Card>
      ) : (
        <div className="space-y-8">
          {note.claims.map((claim) => (
            <ClaimEvidence key={claim.id} claim={claim} locale={locale} t={t} />
          ))}
        </div>
      )}
    </>
  );
}

function ClaimEvidence({ claim, locale, t }: { claim: PublicClaim; locale: Locale; t: Awaited<ReturnType<typeof getT>> }) {
  const evidence = claim.evidence;
  const revisedValue = claim.revised ? formatFigure(claim.revised, locale) : null;
  return (
    <article className="space-y-4">
      <div>
        <p className="text-xl leading-relaxed font-bold">«{claim.wording ?? claim.text}»</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={claim.verdict} t={t} size="sm" />
          <ChainStatus connected={claim.chain_status === "connected"} t={t} />
        </div>
      </div>

      {claim.revised && revisedValue && (
        <div className="flex gap-2 rounded-md bg-context-tint p-3 text-sm text-context-text">
          <Icon name="refresh" size={16} className="mt-0.5 shrink-0" />
          {t("publicNote.revised", {
            value: revisedValue,
            period: claim.revised.period_start && claim.revised.period_end ? periodText(claim.revised.period_start, claim.revised.period_end, locale) : claim.revised.period_label,
            date: claim.revised.at ? formatDate(claim.revised.at, locale) : "—",
          })}
        </div>
      )}

      {claim.chain && claim.chain.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">{t("publicNote.chain")}</h2>
          <ChainView nodes={claim.chain} broken={claim.chain_status === "broken"} />
        </Card>
      )}

      {evidence && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">{t("publicNote.evidence")}</h2>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-muted">
                <Icon name="file" size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {evidencePublisher(evidence, locale)} · {evidence.document.title}
                </p>
                <p className="num text-xs text-muted">
                  {[evidencePeriod(evidence, locale), claim.document?.fetched_at && t("publicNote.retrieved", { date: formatDate(claim.document.fetched_at, locale) })]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            {evidence.document.url && (
              <a
                href={evidence.document.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <Icon name="external" size={14} />
                {t("publicNote.openDocument")}
              </a>
            )}
          </div>
          <blockquote dir="auto" className="mt-3 rounded-sm border-s-4 border-accent bg-highlight/40 px-4 py-3 text-start text-[15px] leading-relaxed">
            «<QuoteMark text={evidence.quote} value={evidence.value} />»
          </blockquote>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {claim.evidence_verified && (
              <span className="inline-flex items-center gap-1 text-match-text">
                <Icon name="check" size={14} />
                {t("publicNote.verbatim")}
              </span>
            )}
            <Badge tone="accent" size="sm">
              {t(`tier.${String(evidence.tier) as "1" | "2" | "3"}`)}
            </Badge>
          </div>
        </Card>
      )}
    </article>
  );
}

export default function PublicNotePage(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <PublicPage {...props} />
    </Suspense>
  );
}

async function PublicPage(props: Props) {
  const { locale: raw, slug } = await props.params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const [t, note] = await Promise.all([getT(locale), SLUG.test(slug) ? loadNote(slug) : null]);
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="truncate text-lg font-bold">{note?.newsroom}</span>
          <div className="flex shrink-0 items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
              <Nuqta size={6} />
              {t("publicNote.badge")}
            </span>
            <Suspense>
              <LocaleSwitch />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-surface-sunken" />}>
          <Note {...props} />
        </Suspense>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          {([1, 2, 3] as const).map((n) => (
            <Card key={n} className="p-4">
              <p className="text-sm font-semibold">{t(`publicNote.how${n}Title`)}</p>
              <p className="mt-1 text-xs text-muted">{t(`publicNote.how${n}Body`)}</p>
            </Card>
          ))}
        </section>
      </main>
      <footer className="mx-auto flex max-w-3xl items-center justify-between px-4 pb-10 sm:px-6">
        <Image src="/brand/isnad-logo-bilingual-color.svg" alt={t("common.appName")} width={130} height={32} className="dark:hidden" />
        <Image src="/brand/isnad-logo-bilingual-reversed.svg" alt={t("common.appName")} width={130} height={32} className="hidden dark:block" />
        <p className="text-xs text-muted">{t("publicNote.tagline")}</p>
      </footer>
    </div>
  );
}
