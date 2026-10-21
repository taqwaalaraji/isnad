"use client";

import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { formatDate, formatDuration, formatRelative } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { geoLabel } from "@/features/registry/components";
import type { ChainNode, EarlierFigure, Evidence, VerifierNote } from "@/lib/types";

import { addComment, decideClaim, searchClaim } from "../actions";
import { ChainStatus, VerdictBadge } from "../badges";
import type { CheckDetail } from "../queries";
import { QuoteMark } from "../quote";
import { ChainView } from "./chain-view";
import { notSearched } from "./claim-card";
import { evidencePeriod, evidencePublisher, evidenceValue } from "./labels";
import type { Capabilities, WorkspaceClaim } from "./types";

function locationText(evidence: Evidence, t: ReturnType<typeof useI18n>["t"]): string {
  const loc = evidence.location ?? {};
  const parts: string[] = [];
  if (loc.page) parts.push(t("check.page", { n: loc.page }));
  if (loc.sheet) parts.push(loc.sheet);
  if (loc.cell) parts.push(loc.cell);
  if (loc.row) parts.push(loc.row);
  return parts.join(" · ");
}

function Section({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-2 text-xs font-medium text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function EvidencePanel({
  claim,
  segmentIdx,
  check,
  comments,
  caps,
}: {
  claim: WorkspaceClaim;
  segmentIdx?: number;
  check: CheckDetail["check"];
  comments: CheckDetail["comments"];
  caps: Capabilities;
}) {
  const { t, locale } = useI18n();
  const result = claim.result;
  const evidence = (result?.evidence ?? null) as Evidence | null;
  const verifier = (result?.verifier ?? null) as VerifierNote | null;
  const chain = (result?.chain ?? []) as ChainNode[];
  const earlier = (result?.earlier_figures ?? []) as EarlierFigure[];
  const searched = (result?.searched_sources ?? []) as string[];
  const differing = result?.differing_fields ?? [];
  const searchState = (result?.comparison as { search?: "done" | "skipped" | "queued" } | null)?.search;
  const reviewable = !["processing", "archived", "failed", "published"].includes(check.status);
  const where = claim.start_ms !== null ? formatDuration(claim.start_ms) : segmentIdx !== undefined ? t("check.paragraph", { n: segmentIdx + 1 }) : "";

  const [dialog, setDialog] = useState<"edit" | "escalate" | null>(null);
  const [note, setNote] = useState("");
  const [wording, setWording] = useState(result?.suggested_wording ?? "");
  const [pending, startTransition] = useTransition();

  function decide(decision: "approve" | "edit" | "escalate" | "reopen") {
    startTransition(async () => {
      const res = await decideClaim(claim.id, decision, note || undefined, decision === "edit" ? wording : undefined);
      if (res.ok) {
        setDialog(null);
        setNote("");
      } else toast.error(t(res.error));
    });
  }

  function searchNow() {
    startTransition(async () => {
      const res = await searchClaim(claim.id);
      if (!res.ok) toast.error(t(res.error));
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("common.copied"));
    } catch {
      toast.error(t("errors.generic"));
    }
  }

  const claimComments = comments.filter((c) => c.claim_id === claim.id);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {result &&
              (result.verdict === "none" && notSearched(result.comparison) ? (
                <Badge tone="outline" icon="search">
                  {t("check.notSearched")}
                </Badge>
              ) : (
                <VerdictBadge verdict={result.verdict} t={t} />
              ))}
            {result && <ChainStatus connected={result.chain_status === "connected"} t={t} />}
            {result?.discovered && (
              <Badge tone="accent" icon="search" size="sm">
                {t("check.discovered")}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-lg leading-relaxed font-semibold">«{claim.span_text}»</p>
          <p className="num mt-1 text-xs text-muted">{[where, claim.speaker, claim.attribution].filter(Boolean).join(" · ")}</p>
        </div>
        {chain.length > 0 && (
          <div className="xl:max-w-[55%]">
            <ChainView nodes={chain} broken={result?.chain_status === "broken"} />
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {result?.verdict === "none" && (
            <div className="rounded-md border border-dashed border-border-strong bg-none-tint/40 p-4 text-sm">
              {searchState === "queued" ? (
                <p className="flex items-center gap-2 text-text">
                  <Icon name="loader" size={16} className="animate-spin text-accent" />
                  {t("check.searching")}
                </p>
              ) : searchState === "skipped" ? (
                <div className="space-y-3">
                  <p className="text-none-text">{t("check.searchSkipped")}</p>
                  {caps.canEdit && reviewable && (
                    <Button size="sm" icon="search" loading={pending} onClick={searchNow}>
                      {t("check.searchNow")}
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-none-text">{t("verdict.explain.none")}</p>
              )}
              {searchState !== "skipped" && searchState !== "queued" && searched.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {t("check.searched")}: <span dir="ltr">{searched.slice(0, 6).join("، ")}</span>
                </p>
              )}
            </div>
          )}

          {evidence && (
            <Section title={evidence.closest ? t("registry.indicator.latest") : t("check.evidence")}>
              <div className="rounded-md border border-border">
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-muted">
                      <Icon name={evidence.location?.kind === "cell" ? "table" : "file"} size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {evidencePublisher(evidence, locale)} · {evidence.document.title}
                      </p>
                      <p className="num truncate text-xs text-muted">
                        {[locationText(evidence, t), evidence.document.fetched_at && t("check.retrievedAt", { date: formatDate(evidence.document.fetched_at, locale) })]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/${locale}/registry/documents/${evidence.document.id}?figure=${evidence.figure_id}`}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
                  >
                    <Icon name="external" size={14} />
                    {t("check.openDocument")}
                  </Link>
                </div>
                <blockquote dir="auto" className="m-3 rounded-sm border-s-4 border-accent bg-highlight/40 px-4 py-3 text-start text-[15px] leading-relaxed">
                  «<QuoteMark text={evidence.quote} value={evidence.value} />»
                </blockquote>
                <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs">
                  {result?.evidence_verified && (
                    <span className="inline-flex items-center gap-1 text-match-text">
                      <Icon name="check" size={14} />
                      {t("check.verbatim")}
                    </span>
                  )}
                  <Badge tone="accent" size="sm">
                    {t(`tier.${String(evidence.tier) as "1" | "2" | "3"}`)}
                  </Badge>
                  {evidence.status !== "final" && (
                    <Badge tone="neutral" size="sm">
                      {t(`registry.figureStatus.${evidence.status}`)}
                    </Badge>
                  )}
                </div>
              </div>
            </Section>
          )}

          {evidence && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-1.5 text-start font-medium" />
                  <th className="py-1.5 text-start font-medium">{t("check.claimSays")}</th>
                  <th className="py-1.5 text-start font-medium">{t("check.sourceSays")}</th>
                </tr>
              </thead>
              <tbody className="num">
                {(
                  [
                    ["value", claim.value !== null ? `${claim.value}${claim.unit === "%" ? "%" : ""}` : "—", evidenceValue(evidence, locale)],
                    ["period", claim.period_text ?? "—", evidencePeriod(evidence, locale)],
                    ["scope", geoLabel(claim.geography, t) || "—", geoLabel(evidence.geography, t) + (evidence.breakdown ? ` · ${evidence.breakdown}` : "")],
                  ] as const
                ).map(([field, mine, theirs]) => (
                  <tr key={field} className={cn("border-t border-border", differing.includes(field) && "bg-context-tint/50")}>
                    <td className="py-2 pe-3 text-xs text-muted">{t(`fields.${field}`)}</td>
                    <td className={cn("py-2 pe-3", differing.includes(field) && "font-semibold text-context-text")}>{mine}</td>
                    <td className="py-2">{theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-4">
          {result?.suggested_wording && (
            <div className="rounded-md bg-surface-sunken p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted">{t("check.suggested")}</h3>
                <button type="button" onClick={() => copy(result.suggested_wording!)} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  <Icon name="copy" size={14} />
                  {t("check.copyWording")}
                </button>
              </div>
              <p className="text-[15px] leading-relaxed">{result.suggested_wording}</p>
            </div>
          )}

          {verifier && (
            <div
              className={cn(
                "flex gap-3 rounded-md p-3 text-sm",
                verifier.agrees && verifier.confidence !== "low" ? "bg-accent-soft/60 text-text" : "bg-context-tint text-context-text",
              )}
            >
              <Icon name={verifier.agrees ? "check" : "alert"} size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium">{verifier.agrees ? t("check.verifierAgrees") : t("check.verifierNote")}</p>
                <p className="mt-0.5">{locale === "ar" ? verifier.note_ar : verifier.note_en}</p>
              </div>
            </div>
          )}

          {earlier.length > 0 && (
            <Section title={t("check.earlierFigures")}>
              <ul className="space-y-1.5 text-sm">
                {earlier.map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="num">{e.value_text}</span>
                    <span className="text-xs text-muted">{e.fetched_at ? t("check.revisedOn", { date: formatDate(e.fetched_at, locale) }) : e.period_label}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {caps.canDecide && reviewable && result && (
            <div className="flex flex-wrap gap-2">
              {claim.review_state === "pending" ? (
                <>
                  <Button variant="primary" icon="check" size="sm" loading={pending} onClick={() => decide("approve")}>
                    {t("check.approve")}
                  </Button>
                  <Button variant="secondary" icon="edit" size="sm" onClick={() => setDialog("edit")}>
                    {t("check.editWording")}
                  </Button>
                  <Button variant="ghost" icon="flag" size="sm" onClick={() => setDialog("escalate")}>
                    {t("check.escalate")}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" icon="refresh" size="sm" loading={pending} onClick={() => decide("reopen")}>
                  {t("check.reopen")}
                </Button>
              )}
            </div>
          )}

          <Section title={`${t("check.comments")} (${claimComments.length})`}>
            <Comments checkId={check.id} claimId={claim.id} comments={claimComments} />
          </Section>
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog && (
          <DialogContent
            closeLabel={t("common.close")}
            title={dialog === "edit" ? t("check.editTitle") : t("check.escalateTitle")}
            description={dialog === "edit" ? t("check.editBody") : t("check.escalateBody")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" loading={pending} onClick={() => decide(dialog)}>
                  {dialog === "edit" ? t("common.save") : t("check.escalate")}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              {dialog === "edit" && (
                <Field label={t("check.suggested")} htmlFor="wording">
                  <Textarea id="wording" rows={4} value={wording} onChange={(e) => setWording(e.target.value)} />
                </Field>
              )}
              <Field label={t("check.decisionNote")} htmlFor="note">
                <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}

function Comments({ checkId, claimId, comments }: { checkId: string; claimId: string; comments: CheckDetail["comments"] }) {
  const { t, locale } = useI18n();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-xs text-subtle">{t("check.noComments")}</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Avatar name={c.user?.full_name ?? "?"} size={24} />
              <div className="min-w-0">
                <p className="text-xs text-muted">
                  <span className="font-medium text-text">{c.user?.full_name}</span> · {formatRelative(c.created_at, locale)}
                </p>
                <p className="text-sm whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          startTransition(async () => {
            const res = await addComment(checkId, claimId, body);
            if (res.ok) setBody("");
            else toast.error(t(res.error));
          });
        }}
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("check.addComment")}
          aria-label={t("check.addComment")}
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm focus:border-accent focus:outline-none"
        />
        <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={!body.trim()}>
          {t("check.sendComment")}
        </Button>
      </form>
    </div>
  );
}
