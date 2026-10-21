"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { formatFigure } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { approveFigures, type FigureInput, rejectFigures, updateFigure } from "../actions";
import { GEOGRAPHIES, GEOGRAPHY_AR, MEASURES, SCALES } from "../constants";
import type { CatalogOptions, ReviewFigure } from "../queries";
import type { FigureContext } from "./context";

export type ReviewItem = ReviewFigure & { context: FigureContext; versionNumber: number | null };

type Status = "preliminary" | "final" | "revised";

function toForm(f: ReviewItem): FigureInput {
  return {
    id: f.id,
    indicatorId: f.indicator_id,
    entityId: f.entity_id,
    value: String(f.value),
    scale: (SCALES as readonly string[]).includes(f.scale) ? (f.scale as FigureInput["scale"]) : "one",
    unit: f.unit,
    periodStart: f.period_start,
    periodEnd: f.period_end,
    periodLabel: f.period_label,
    geography: f.geography,
    breakdown: f.breakdown ?? "",
    measure: (MEASURES as readonly string[]).includes(f.measure) ? (f.measure as FigureInput["measure"]) : "level",
    status: f.status,
  };
}

/** The figure's number inside its quote, marked; never a digit inside a longer number. */
function Marked({ text, value }: { text: string; value: number }) {
  const forms = [...new Set([String(value), value.toLocaleString("en-US", { maximumFractionDigits: 6 })])].sort((a, b) => b.length - a.length);
  for (const form of forms) {
    const m = new RegExp(`(?<![\\d.,])${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d]|[.,]\\d)`).exec(text);
    if (m) {
      return (
        <>
          {text.slice(0, m.index)}
          <mark className="num rounded-xs bg-accent px-0.5 font-semibold text-on-accent">{m[0]}</mark>
          {text.slice(m.index + m[0].length)}
        </>
      );
    }
  }
  return <>{text}</>;
}

function DocumentPanel({ item }: { item: ReviewItem }) {
  const { t } = useI18n();
  const context = item.context;
  const location = (item.location ?? {}) as { kind?: string; sheet?: string; cell?: string; page?: number; row?: string; column?: string };
  const where = [
    location.page ? t("console.review.page", { n: location.page }) : null,
    location.sheet && location.cell ? t("console.review.sheetCell", { sheet: location.sheet, cell: location.cell }) : null,
    location.row && !location.cell ? location.row : null,
    location.column && !location.cell ? location.column : null,
  ].filter(Boolean);

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-surface-sunken p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-text">{t("console.review.fromDocument", { n: item.versionNumber ?? 1 })}</span>
        <span className="num text-muted">{where.join(" · ")}</span>
      </div>
      <div className="min-w-0 rounded-md bg-white p-4 text-[#0E1230] shadow-card md:p-6">
        <p className="mb-3 truncate text-sm font-semibold" dir="auto" title={item.document?.title}>
          {item.document?.title}
        </p>
        {context?.kind === "cell" ? (
          <div className="overflow-x-auto">
            <table className="num w-full border-collapse text-xs" dir="ltr">
              <thead>
                <tr>
                  <th className="w-10 border border-[#DCD9D2] bg-[#EFEBE2] px-2 py-1 text-[10px] text-[#5E647E]" />
                  {context.columns.map((c) => (
                    <th key={c} className={cn("border border-[#DCD9D2] bg-[#EFEBE2] px-2 py-1 font-medium text-[#5E647E]", context.target?.column === c && "text-[#3355FF]")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {context.rows.map((row) => {
                  const isRow = context.target?.row === row.number;
                  return (
                    <tr key={row.number} className={isRow ? "bg-[#DDE3FF]" : undefined}>
                      <td className="border border-[#DCD9D2] bg-[#EFEBE2] px-2 py-1 text-center text-[10px] text-[#5E647E]">{row.number}</td>
                      {row.cells.map((cell, i) => {
                        const isTarget = isRow && context.columns[i] === context.target?.column;
                        return (
                          <td
                            key={i}
                            dir="auto"
                            className={cn("max-w-[220px] truncate border border-[#DCD9D2] px-2 py-1", isTarget && "outline-2 -outline-offset-2 outline-[#3355FF] font-semibold")}
                            title={cell}
                          >
                            {cell}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : context?.kind === "text" ? (
          <p dir="auto" className="max-h-[420px] overflow-y-auto text-[15px] leading-loose whitespace-pre-wrap text-start">
            <span className="text-[#5E647E]">{context.before}</span>
            {context.found && (
              <mark className="rounded-xs bg-[#DDE3FF] px-0.5 text-[#0E1230]">
                <Marked text={context.match} value={Number(item.value)} />
              </mark>
            )}
            <span className="text-[#5E647E]">{context.after}</span>
          </p>
        ) : null}
        {(!context || (context.kind === "text" && !context.found)) && (
          <div className="mt-3 rounded-md border border-dashed border-[#DCD9D2] p-3 text-sm">
            <p className="mb-1 text-xs text-[#5E647E]">{t("console.review.contextMissing")}</p>
            <p dir="auto" className="font-medium">
              «<Marked text={item.quote} value={Number(item.value)} />»
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
            item.quote_verified ? "bg-surface text-text" : "bg-context-tint text-context-text",
          )}
        >
          <Icon name={item.quote_verified ? "check" : "alert"} size={14} className={item.quote_verified ? "text-accent" : ""} />
          {item.quote_verified ? t("console.review.verified") : t("console.review.notVerified")}
        </span>
        {item.document?.url && (
          <a href={item.document.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            <Icon name="external" size={14} />
            {t("console.review.openOriginal")}
          </a>
        )}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="num rounded-xs border border-border bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium text-muted">{children}</kbd>;
}

export function ReviewWorkspace({
  items,
  catalog,
  total,
  nextFile,
}: {
  items: ReviewItem[];
  catalog: CatalogOptions;
  total: number;
  nextFile: string | null;
}) {
  const { t, locale } = useI18n();
  // The file's size when review started here: refreshes shrink `total` as figures are handled.
  const [startTotal] = useState(total);
  const fileTotal = Math.max(startTotal, total);
  const [currentId, setCurrentId] = useState<string | null>(items[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FigureInput | null>(null);
  const [rejecting, setRejecting] = useState<"one" | "file" | null>(null);
  const [note, setNote] = useState("");
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  // Figures handled here disappear at once; the server list catches up on refresh.
  const queue = useMemo(() => items.filter((i) => !handled.has(i.id)), [items, handled]);
  const index = Math.max(0, queue.findIndex((i) => i.id === currentId));
  const item = queue[index] ?? null;
  const reviewedCount = Math.max(0, fileTotal - queue.length);
  const inFile = item ? queue.filter((i) => i.document_version_id === item.document_version_id) : [];
  const verifiedInFile = inFile.filter((i) => i.quote_verified && i.indicator_id);

  const go = useCallback(
    (delta: number) => {
      if (!queue.length) return;
      const next = queue[Math.min(queue.length - 1, Math.max(0, index + delta))];
      setCurrentId(next.id);
      setEditing(false);
    },
    [queue, index],
  );

  const done = useCallback(
    (ids: string[]) => {
      const nextItem = queue.slice(index + 1).find((i) => !ids.includes(i.id)) ?? queue.slice(0, index).reverse().find((i) => !ids.includes(i.id));
      setHandled((h) => new Set([...h, ...ids]));
      setCurrentId(nextItem?.id ?? null);
      setEditing(false);
    },
    [queue, index],
  );

  const approve = useCallback(() => {
    if (!item || pending) return;
    if (!item.indicator_id) {
      toast.error(t("console.review.noIndicator"));
      return;
    }
    startTransition(async () => {
      const res = await approveFigures([item.id]);
      if (res.ok) {
        toast.success(t("console.review.approvedToast"));
        done([item.id]);
      } else toast.error(t(res.error));
    });
  }, [item, pending, t, done]);

  function reject() {
    if (!item) return;
    const ids = rejecting === "file" ? inFile.map((i) => i.id) : [item.id];
    startTransition(async () => {
      const res = await rejectFigures(ids, note);
      if (res.ok) {
        toast.success(ids.length > 1 ? t("console.review.rejectedManyToast", { n: ids.length }) : t("console.review.rejectedToast"));
        setRejecting(null);
        setNote("");
        done(ids);
      } else toast.error(t(res.error));
    });
  }

  function bulkApprove() {
    const ids = verifiedInFile.map((i) => i.id);
    startTransition(async () => {
      const res = await approveFigures(ids);
      if (res.ok) {
        toast.success(t("console.review.bulkApproved", { n: res.data ?? ids.length }));
        done(ids);
      } else toast.error(t(res.error));
    });
  }

  function save(patch?: Partial<FigureInput>) {
    const values = { ...(form ?? (item ? toForm(item) : null)), ...patch } as FigureInput;
    if (!values?.id) return;
    startTransition(async () => {
      const res = await updateFigure(values);
      if (res.ok) {
        toast.success(t("console.review.savedToast"));
        setEditing(false);
      } else toast.error(t(res.error));
    });
  }

  function startEdit() {
    if (!item) return;
    setForm(toForm(item));
    setEditing(true);
  }

  // Keyboard: A approve · E fix · R reject · J/K next/previous · Esc cancel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) {
        if (e.key === "Escape") setEditing(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || rejecting) return;
      const key = e.key.toLowerCase();
      if (key === "j") go(1);
      else if (key === "k") go(-1);
      else if (key === "a") approve();
      else if (key === "e") startEdit();
      else if (key === "r") setRejecting("one");
      else if (key === "escape") setEditing(false);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!item) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="circle-check" size={32} />}
          title={nextFile ? t("console.review.fileDone") : t("console.review.done")}
          body={nextFile ? undefined : t("console.review.doneBody")}
          action={
            nextFile ? (
              <ButtonLink href={`/${locale}/console/review?version=${nextFile}`} variant="primary" iconEnd="arrow-right">
                {t("console.review.nextFile")}
              </ButtonLink>
            ) : (
              <Link href={`/${locale}/console/inbox`} className="text-sm font-medium text-accent hover:underline">
                {t("console.inbox.title")}
              </Link>
            )
          }
        />
      </Card>
    );
  }

  const indicatorName = item.indicator ? (locale === "ar" ? item.indicator.name_ar : item.indicator.name_en) : null;
  const entityName = item.entity ? (locale === "ar" ? item.entity.name_ar : item.entity.name_en) : null;
  const sourceName = item.source ? (locale === "ar" ? item.source.name_ar : item.source.name_en) : "";
  const geography = (g: string) => (locale === "ar" ? (GEOGRAPHY_AR[g] ?? g) : g);
  const proposal = item.review_note?.startsWith("proposed indicator:") ? item.review_note.replace(/^proposed indicator:\s*/, "") : null;
  const f = form;
  const setF = (patch: Partial<FigureInput>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  const indicatorOptions = catalog.indicators.map((i) => (
    <option key={i.id} value={i.id}>
      {locale === "ar" ? i.name_ar : i.name_en}
    </option>
  ));

  const display: Array<[MessageKey, string]> = [
    ["console.review.fields.indicator", indicatorName ?? "—"],
    ["console.review.fields.entity", entityName ?? "—"],
    ["console.review.fields.value", formatFigure({ value: item.value, scale: item.scale, decimals: item.decimals, unit: item.unit }, locale)],
    ["console.review.fields.measure", t(`registry.measure.${item.measure}` as MessageKey)],
    ["console.review.fields.period", item.period_label],
    ["console.review.fields.geography", [geography(item.geography), item.breakdown].filter(Boolean).join(" · ")],
    ["console.review.fields.source", sourceName],
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold md:text-[28px]">{t("console.review.title")}</h1>
          <p className="num mt-1 truncate text-sm text-muted">
            {t("console.review.subtitle", { document: item.document?.title ?? "", n: reviewedCount + 1, total: fileTotal })} · {sourceName}
          </p>
          <ProgressBar value={(reviewedCount / Math.max(1, fileTotal)) * 100} label={t("console.review.title")} className="mt-3 max-w-xs" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {verifiedInFile.length > 1 && (
            <Button icon="check" loading={pending} onClick={bulkApprove}>
              {t("console.review.bulkApprove", { n: verifiedInFile.length })}
            </Button>
          )}
          <Button icon="x" disabled={pending} onClick={() => setRejecting("file")}>
            {t("console.review.rejectAll")}
          </Button>
          <Button variant="ghost" icon="arrow-left" disabled={index === 0} onClick={() => go(-1)} className="rtl:[&>svg]:-scale-x-100">
            {t("console.review.previous")}
          </Button>
          <Button variant="ghost" iconEnd="arrow-right" disabled={index >= queue.length - 1} onClick={() => go(1)}>
            {t("console.review.skip")}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="h-fit p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Icon name="review" size={18} className="text-muted" />
              {t("console.review.extracted")}
            </h2>
            {!editing && (
              <button type="button" onClick={startEdit} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                <Icon name="edit" size={14} />
                {t("console.review.fix")}
              </button>
            )}
          </div>

          {proposal && !item.indicator_id && (
            <p className="mb-3 rounded-md bg-accent-soft/60 px-3 py-2 text-xs" dir="auto">
              {t("console.review.proposed", { name: proposal })}
            </p>
          )}

          {!editing || !f ? (
            <dl className="divide-y divide-border">
              {display.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <dt className="shrink-0 text-muted">{t(label)}</dt>
                  <dd className={cn("min-w-0 text-end font-medium break-words", label === "console.review.fields.indicator" && !item.indicator_id && "text-differ-text")} dir="auto">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="space-y-3">
              <Field label={t("console.review.fields.indicator")} htmlFor="f-indicator">
                <Select id="f-indicator" value={f.indicatorId ?? ""} onChange={(e) => setF({ indicatorId: e.target.value || null })}>
                  <option value="">{t("console.review.chooseIndicator")}</option>
                  {indicatorOptions}
                </Select>
              </Field>
              <Field label={t("console.review.fields.entity")} htmlFor="f-entity">
                <Select id="f-entity" value={f.entityId ?? ""} onChange={(e) => setF({ entityId: e.target.value || null })}>
                  <option value="">—</option>
                  {catalog.entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {locale === "ar" ? e.name_ar : e.name_en}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <Field label={t("console.review.fields.value")} htmlFor="f-value">
                  <Input id="f-value" dir="ltr" inputMode="decimal" className="num" value={f.value} onChange={(e) => setF({ value: e.target.value })} />
                </Field>
                <Field label={t("console.review.fields.scale")} htmlFor="f-scale">
                  <Select id="f-scale" value={f.scale} onChange={(e) => setF({ scale: e.target.value as FigureInput["scale"] })}>
                    {SCALES.map((s) => (
                      <option key={s} value={s}>
                        {t(`console.review.scales.${s}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("console.review.fields.unit")} htmlFor="f-unit">
                  <Input id="f-unit" dir="ltr" value={f.unit} onChange={(e) => setF({ unit: e.target.value })} />
                </Field>
                <Field label={t("console.review.fields.measure")} htmlFor="f-measure">
                  <Select id="f-measure" value={f.measure} onChange={(e) => setF({ measure: e.target.value as FigureInput["measure"] })}>
                    {MEASURES.map((m) => (
                      <option key={m} value={m}>
                        {t(`registry.measure.${m}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("console.review.fields.periodStart")} htmlFor="f-start">
                  <Input id="f-start" type="date" value={f.periodStart} onChange={(e) => setF({ periodStart: e.target.value })} />
                </Field>
                <Field label={t("console.review.fields.periodEnd")} htmlFor="f-end">
                  <Input id="f-end" type="date" value={f.periodEnd} onChange={(e) => setF({ periodEnd: e.target.value })} />
                </Field>
              </div>
              <Field label={t("console.review.fields.periodLabel")} htmlFor="f-label">
                <Input id="f-label" dir="auto" value={f.periodLabel} onChange={(e) => setF({ periodLabel: e.target.value })} />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <Field label={t("console.review.fields.geography")} htmlFor="f-geo">
                  <Select id="f-geo" value={f.geography} onChange={(e) => setF({ geography: e.target.value })}>
                    {[...new Set([...GEOGRAPHIES, f.geography])].map((g) => (
                      <option key={g} value={g}>
                        {geography(g)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("console.review.fields.breakdown")} htmlFor="f-breakdown">
                  <Input id="f-breakdown" dir="auto" value={f.breakdown} onChange={(e) => setF({ breakdown: e.target.value })} />
                </Field>
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">{t("console.review.fields.status")}</p>
            <Segmented<Status>
              label={t("console.review.fields.status")}
              size="sm"
              value={editing && f ? f.status : item.status}
              onChange={(status) => (editing ? setF({ status }) : save({ ...toForm(item), status }))}
              options={(["preliminary", "final", "revised"] as const).map((s) => ({ value: s, label: t(`registry.figureStatus.${s}`) }))}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                  {t("console.review.cancel")}
                </Button>
                <Button variant="primary" icon="check" loading={pending} className="ms-auto" onClick={() => save()}>
                  {t("console.review.save")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" icon="x" disabled={pending} onClick={() => setRejecting("one")}>
                  {t("console.review.reject")}
                </Button>
                <Button icon="edit" disabled={pending} className="ms-auto" onClick={startEdit}>
                  {t("console.review.fix")}
                </Button>
                <Button variant="primary" icon="check" loading={pending} onClick={approve} disabled={!item.indicator_id}>
                  {t("console.review.approve")}
                </Button>
              </>
            )}
          </div>
          {!item.indicator_id && !editing && <p className="mt-2 text-xs text-differ-text">{t("console.review.noIndicator")}</p>}
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted" aria-hidden>
            <span>
              <Kbd>A</Kbd> {t("console.review.approve")}
            </span>
            <span>
              <Kbd>E</Kbd> {t("console.review.fix")}
            </span>
            <span>
              <Kbd>R</Kbd> {t("console.review.reject")}
            </span>
            <span>
              <Kbd>J</Kbd>/<Kbd>K</Kbd> {t("console.review.skip")}
            </span>
          </p>
        </Card>

        <DocumentPanel item={item} />
      </div>

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        {rejecting && (
          <DialogContent
            size="sm"
            closeLabel={t("common.close")}
            title={rejecting === "file" ? t("console.review.rejectAll") : t("console.review.reject")}
            description={rejecting === "file" ? t("console.review.rejectAllConfirm", { n: inFile.length }) : undefined}
            footer={
              <>
                <Button variant="ghost" onClick={() => setRejecting(null)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" icon="x" loading={pending} onClick={reject}>
                  {rejecting === "file" ? t("console.review.rejectAll") : t("console.review.reject")}
                </Button>
              </>
            }
          >
            <Field label={t("console.review.rejectNote")} htmlFor="reject-note">
              <Textarea id="reject-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            </Field>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
