"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, Skeleton } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Nuqta } from "@/components/ui/nuqta";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { askRegistry } from "./actions";
import type { AskAnswer, AskEvidence } from "./types";

const MARKER = /\[(\d{1,2})\]/g;
const NUMBER = /\d[\d,]*(?:\.\d+)?%?/g;

/** The answer text with its numbers in bold and [n] markers linked to their evidence. */
function AnswerText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    const before = text.slice(last, match.index);
    parts.push(<Fragment key={`t${last}`}>{boldNumbers(before)}</Fragment>);
    parts.push(
      <a key={`m${match.index}`} href={`#evidence-${match[1]}`} className="num mx-0.5 align-super text-[11px] font-semibold text-accent hover:underline">
        [{match[1]}]
      </a>,
    );
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(<Fragment key="end">{boldNumbers(text.slice(last))}</Fragment>);
  return <>{parts}</>;
}

function boldNumbers(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(NUMBER)) {
    const value = match[0];
    // Leave years plain; bold the figures.
    const isYear = /^(19|20)\d{2}$/.test(value);
    out.push(text.slice(last, match.index));
    out.push(
      isYear ? (
        value
      ) : (
        <strong key={match.index} className="num font-semibold">
          {value}
        </strong>
      ),
    );
    last = (match.index ?? 0) + value.length;
  }
  out.push(text.slice(last));
  return out;
}

function EvidenceCard({ evidence, n }: { evidence: AskEvidence; n: number }) {
  const { t, locale } = useI18n();
  const source = locale === "ar" ? evidence.source_name_ar : evidence.source_name_en;
  const location = [
    evidence.location?.page ? t("check.page", { n: evidence.location.page }) : null,
    evidence.location?.sheet && evidence.location?.cell ? t("registry.document.sheetCell", { sheet: evidence.location.sheet, cell: evidence.location.cell }) : null,
    evidence.published_at ? t("registry.document.publishedOn", { date: formatDate(evidence.published_at, locale) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card id={`evidence-${n}`} className="scroll-mt-24 p-5">
      <p className="mb-3 text-xs text-muted">
        <span className="num">[{n}]</span> {evidence.is_current ? t("registry.ask.currentFigure") : t("registry.indicator.superseded")}
        {" · "}
        {locale === "ar" ? evidence.indicator_name_ar : evidence.indicator_name_en}
        {" · "}
        <span className="num font-medium text-text">{locale === "ar" ? evidence.value_text : evidence.value_text_en}</span>
        {" · "}
        {locale === "ar" ? evidence.period_label_ar : evidence.period_label_en}
      </p>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-muted">
            <Icon name={evidence.location?.cell ? "table" : "file"} size={16} />
          </span>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold">
              {source} · {evidence.document_title}
            </p>
            {location && <p className="num text-xs text-muted">{location}</p>}
          </div>
        </div>
        <Link
          href={`/${locale}/registry/documents/${evidence.document_id}?figure=${evidence.figure_id}`}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <Icon name="external" size={14} />
          {t("check.openDocument")}
        </Link>
      </div>
      <blockquote dir="auto" className="mt-3 rounded-sm border-s-4 border-accent bg-surface-sunken/70 px-4 py-3 text-start text-[15px] leading-relaxed">
        «{evidence.quote}»
      </blockquote>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted">
          {evidence.quote_verified && (
            <>
              <Nuqta tone="match" size={6} />
              {t("check.verbatim")}
              {" · "}
            </>
          )}
          {evidence.fetched_at && t("check.retrievedAt", { date: formatDate(evidence.fetched_at, locale) })}
        </span>
        <Badge tone={evidence.tier === 3 ? "outline" : "accent"} size="sm">
          {t(`tier.${String(evidence.tier) as "1" | "2" | "3"}`)}
        </Badge>
      </div>
      {evidence.earlier.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium text-muted">{t("registry.ask.beforeRevision")}</p>
          <ul className="space-y-1.5">
            {evidence.earlier.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="num">{locale === "ar" ? e.value_text : e.value_text_en}</span>
                <span className="text-xs text-muted">
                  {[e.document_title, e.fetched_at ? formatDate(e.fetched_at, locale) : null].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function AskPanel({ initialQuestion }: { initialQuestion: string }) {
  const { t, locale } = useI18n();
  const [question, setQuestion] = useState(initialQuestion);
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();
  const started = useRef(false);

  function ask(text: string) {
    const q = text.trim();
    if (q.length < 3) {
      setError("registry.ask.tooShort");
      return;
    }
    setQuestion(q);
    setAsked(q);
    setError(null);
    startTransition(async () => {
      const result = await askRegistry(q);
      if (result.ok) setAnswer(result.data ?? null);
      else {
        setAnswer(null);
        setError(result.error);
      }
    });
  }

  // A question handed over from search (?q=) is asked once on arrival.
  useEffect(() => {
    if (initialQuestion && !started.current) {
      started.current = true;
      ask(initialQuestion);
    }
  }, [initialQuestion]);

  const examples = [t("registry.ask.example1"), t("registry.ask.example2"), t("registry.ask.example3")];
  const sources = answer?.citations.reduce<AskEvidence[]>((list, e) => (list.some((x) => x.document_id === e.document_id) ? list : [...list, e]), []) ?? [];

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex items-center gap-3 rounded-xl border-[1.5px] border-accent bg-surface py-2 ps-5 pe-2 shadow-card"
      >
        <Icon name="sparkles" size={20} className="shrink-0 text-accent" />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("registry.ask.placeholder")}
          aria-label={t("registry.ask.placeholder")}
          maxLength={500}
          className="h-11 min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-subtle focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <Icon name="arrow-left" size={16} className="ltr:rotate-180" />}
          {t("registry.ask.submit")}
        </button>
      </form>

      {!asked && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{t("registry.ask.examplesTitle")}</span>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => ask(example)}
              className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-border-strong hover:bg-surface-sunken"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4" aria-live="polite" aria-busy={pending}>
          {pending ? (
            <Card className="space-y-3 p-6">
              <p className="flex items-center gap-2 text-sm text-accent">
                <Icon name="sparkles" size={16} />
                {t("registry.ask.thinking")}
              </p>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ) : error ? (
            <Card className="flex items-start gap-3 p-5 text-sm">
              <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-differ-text" />
              <p>{t(error)}</p>
            </Card>
          ) : answer && !answer.answerable ? (
            <Card className="p-6">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Icon name="info" size={16} className="text-muted" />
                {t("registry.ask.noAnswer")}
              </p>
              {answer.reason && <p className="mt-2 text-sm text-muted">{answer.reason}</p>}
              {asked && (
                <Link href={`/${locale}/registry?q=${encodeURIComponent(asked)}`} className="mt-4 inline-flex items-center gap-1 text-sm text-accent hover:underline">
                  <Icon name="search" size={14} />
                  {t("registry.searchTab")}: «{asked}»
                </Link>
              )}
            </Card>
          ) : answer ? (
            <>
              <Card className="p-6">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                    <Icon name="sparkles" size={16} />
                    {t("registry.ask.answerTitle")}
                  </p>
                </div>
                <p dir={answer.language === "ar" ? "rtl" : "ltr"} className="text-[17px] leading-loose">
                  <AnswerText text={answer.answer} />
                </p>
                {answer.follow_ups.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {answer.follow_ups.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => ask(f)}
                        className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-border-strong hover:bg-surface-sunken"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
              <h2 className="pt-2 text-lg font-semibold">{t("registry.ask.sources")}</h2>
              {answer.citations.map((evidence, i) => (
                <EvidenceCard key={evidence.figure_id} evidence={evidence} n={i + 1} />
              ))}
            </>
          ) : null}
        </div>

        <aside className="space-y-4">
          {sources.length > 0 && (
            <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                {t("registry.ask.answerSources")}
                <span className="num rounded-full bg-surface-sunken px-2 text-xs font-normal text-muted">{sources.length}</span>
              </h2>
              <ul className="space-y-3">
                {sources.map((s) => (
                  <li key={s.document_id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/${locale}/registry/documents/${s.document_id}`} className="line-clamp-2 text-sm font-medium hover:text-accent">
                        {s.document_title}
                      </Link>
                      <p className="text-xs text-muted">
                        {[locale === "ar" ? s.source_name_ar : s.source_name_en, s.fetched_at ? formatDate(s.fetched_at, locale) : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Badge tone={s.tier === 3 ? "outline" : "accent"} size="sm">
                      {t(`tier.short${String(s.tier) as "1" | "2" | "3"}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="rounded-lg bg-surface-sunken/70 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
              <Icon name="info" size={16} className="text-muted" />
              {t("registry.ask.limitsTitle")}
            </h2>
            <ul className="space-y-2 text-sm">
              {(["limit1", "limit2", "limit3"] as const).map((key) => (
                <li key={key} className="flex items-center gap-2">
                  <Nuqta tone="muted" size={7} />
                  {t(`registry.ask.${key}`)}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{t("registry.ask.onlyRegistry")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
