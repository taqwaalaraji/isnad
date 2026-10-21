"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { formatDate, formatFigure } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { dismissIndicatorProposal, reviewSourceProposal } from "../actions";
import { TierBadge } from "../badges";
import { EMPTY_INDICATOR, IndicatorDialog } from "../catalog/catalog-forms";
import { UNIT_KINDS } from "../constants";
import { slugify } from "../domains";
import type { IndicatorProposal, SourceProposal } from "../queries";

type Topic = { id: string; slug: string; name_ar: string; name_en: string };

export function SourceProposalCard({ proposal }: { proposal: SourceProposal }) {
  const { t, locale } = useI18n();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const link = proposal.data_url || proposal.homepage_url;

  function decide(accept: boolean) {
    startTransition(async () => {
      const res = await reviewSourceProposal(proposal.id, accept, note);
      if (res.ok) toast.success(t(accept ? "console.proposals.accepted" : "console.proposals.rejected"));
      else toast.error(t(res.error));
    });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{locale === "ar" ? proposal.name_ar : proposal.name_en}</h3>
            <TierBadge tier={proposal.tier} t={t} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted" dir="ltr">
            {proposal.domains.join(" · ")}
          </p>
          <p className="mt-1 text-xs text-muted">
            {[
              proposal.newsroom ? t("console.proposals.from", { newsroom: proposal.newsroom.name }) : null,
              proposal.proposer ? t("console.proposals.proposedBy", { name: proposal.proposer.full_name || proposal.proposer.email }) : null,
              formatDate(proposal.created_at, locale),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            <Icon name="external" size={14} />
            {t("console.sources.open")}
          </a>
        )}
      </div>
      {proposal.proposal_note && (
        <p className="mt-3 rounded-md bg-surface-sunken px-3 py-2 text-sm" dir="auto">
          {proposal.proposal_note}
        </p>
      )}
      <Field label={t("console.proposals.note")} htmlFor={`note-${proposal.id}`} className="mt-4">
        <Textarea id={`note-${proposal.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" icon="x" disabled={pending} onClick={() => decide(false)}>
          {t("console.proposals.reject")}
        </Button>
        <Button variant="primary" icon="check" loading={pending} onClick={() => decide(true)}>
          {t("console.proposals.accept")}
        </Button>
      </div>
    </Card>
  );
}

export function IndicatorProposalCard({ proposal, topics }: { proposal: IndicatorProposal; topics: Topic[] }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { parsed, figures } = proposal;
  const sample = figures[0];
  const ids = figures.map((f) => f.id);
  const unitKind = parsed.unit === "%" ? "percent" : /^(AED|USD|EUR)$/i.test(parsed.unit) ? "currency" : "count";

  function dismiss() {
    startTransition(async () => {
      const res = await dismissIndicatorProposal(ids);
      if (res.ok) toast.success(t("console.proposals.dismissed"));
      else toast.error(t(res.error));
    });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{locale === "ar" ? parsed.nameAr : parsed.nameEn || parsed.nameAr}</h3>
          <p className="mt-0.5 text-xs text-muted">{[locale === "ar" ? parsed.nameEn : parsed.nameAr, parsed.unit, parsed.topic].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="num rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">{t("console.proposals.figuresCount", { n: figures.length })}</span>
      </div>
      {sample && (
        <div className="mt-3 rounded-md bg-surface-sunken px-3 py-2">
          <p className="line-clamp-2 text-sm" dir="auto">
            <span className="num font-semibold">{formatFigure({ value: sample.value, scale: sample.scale, decimals: sample.decimals, unit: sample.unit }, locale)}</span>
            {" · "}
            {sample.period_label} · {t("console.proposals.example", { quote: sample.quote.slice(0, 160) })}
          </p>
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" disabled={pending} onClick={dismiss}>
          {t("console.proposals.dismiss")}
        </Button>
        <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>
          {t("console.proposals.createIndicator")}
        </Button>
      </div>
      {open && (
        <IndicatorDialog
          open
          onOpenChange={setOpen}
          topics={topics}
          assignFigures={ids}
          initial={{
            ...EMPTY_INDICATOR,
            nameAr: parsed.nameAr,
            nameEn: parsed.nameEn,
            slug: slugify(parsed.nameEn),
            unit: parsed.unit,
            unitKind: (UNIT_KINDS as readonly string[]).includes(unitKind) ? (unitKind as typeof EMPTY_INDICATOR.unitKind) : "count",
            topicId: topics.find((tp) => tp.slug === parsed.topic)?.id ?? null,
          }}
        />
      )}
    </Card>
  );
}
