"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { ListSearch } from "@/features/checks/list-search";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { type EntityInput, type IndicatorInput, saveEntity, saveIndicator } from "../actions";
import { ENTITY_KINDS, ENTITY_LEVELS, FREQUENCIES, oneOf, UNIT_KINDS } from "../constants";
import type { EntityRow, IndicatorRow } from "../queries";
import { EMPTY_ENTITY, EMPTY_INDICATOR, EntityDialog, IndicatorDialog } from "./catalog-forms";

type Topic = { id: string; slug: string; name_ar: string; name_en: string };

function indicatorInput(row: IndicatorRow): IndicatorInput {
  return {
    id: row.id,
    slug: row.slug,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    topicId: row.topic_id,
    unitKind: oneOf(UNIT_KINDS, row.unit_kind) ?? "count",
    unit: row.unit,
    frequency: oneOf(FREQUENCIES, row.frequency),
    defaultGeography: row.default_geography,
    aliases: row.aliases,
    definitionAr: row.definition_ar ?? "",
    definitionEn: row.definition_en ?? "",
  };
}

function entityInput(row: EntityRow): EntityInput {
  return {
    id: row.id,
    slug: row.slug,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    shortNameAr: row.short_name_ar ?? "",
    shortNameEn: row.short_name_en ?? "",
    kind: oneOf(ENTITY_KINDS, row.kind) ?? "other",
    level: oneOf(ENTITY_LEVELS, row.level) ?? "federal",
    emirate: row.emirate ?? "",
    website: row.website ?? "",
    aliases: row.aliases,
  };
}

/** Aliases as chips, with inline add and remove (saved immediately). */
function Aliases({ aliases, onSave, pending }: { aliases: string[]; onSave: (next: string[]) => void; pending: boolean }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("console.catalog.aliases")}</h3>
      {aliases.length ? (
        <div className="flex flex-wrap gap-1.5">
          {aliases.map((alias) => (
            <span key={alias} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs" dir="auto">
              {alias}
              <button
                type="button"
                disabled={pending}
                aria-label={`${t("common.remove")} ${alias}`}
                onClick={() => onSave(aliases.filter((a) => a !== alias))}
                className="text-muted hover:text-differ-text"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-subtle">{t("console.catalog.noAliases")}</p>
      )}
      <Input
        dir="auto"
        placeholder={t("console.catalog.aliasAdd")}
        aria-label={t("console.catalog.aliasAdd")}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            if (!aliases.includes(draft.trim())) onSave([...aliases, draft.trim()]);
            setDraft("");
          }
        }}
      />
    </div>
  );
}

export function CatalogView({
  kind,
  indicators,
  entities,
  topics,
  subtitle,
}: {
  subtitle: string;
  kind: "indicators" | "entities";
  indicators: IndicatorRow[];
  entities: EntityRow[];
  topics: Topic[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "indicator" | "entity"; id: string | null; nonce: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const name = (row: { name_ar: string; name_en: string }) => (locale === "ar" ? row.name_ar : row.name_en);

  const rows = kind === "indicators" ? indicators : entities;
  const current = rows.find((r) => r.id === selected) ?? rows[0] ?? null;

  function switchKind(next: "indicators" | "entities") {
    const search = new URLSearchParams(params);
    if (next === "indicators") search.delete("kind");
    else search.set("kind", next);
    search.delete("q");
    setSelected(null);
    router.replace(search.toString() ? `${pathname}?${search}` : pathname);
  }

  function saveAliases(next: string[]) {
    if (!current) return;
    startTransition(async () => {
      const res =
        kind === "indicators"
          ? await saveIndicator({ ...indicatorInput(current as IndicatorRow), aliases: next })
          : await saveEntity({ ...entityInput(current as EntityRow), aliases: next });
      if (res.ok) toast.success(t("console.catalog.saved"));
      else toast.error(t(res.error));
    });
  }

  const editing = dialog?.id ? rows.find((r) => r.id === dialog.id) : null;
  const website = kind === "entities" && current ? (current as EntityRow).website : null;

  return (
    <>
      <PageHeader
        title={t("console.catalog.title")}
        subtitle={subtitle}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setDialog({ kind: kind === "indicators" ? "indicator" : "entity", id: null, nonce: Date.now() })}>
            {kind === "indicators" ? t("console.catalog.newIndicator") : t("console.catalog.newEntity")}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label={t("console.catalog.title")}
              value={kind}
              onChange={switchKind}
              options={[
                { value: "indicators", label: t("console.catalog.indicators") },
                { value: "entities", label: t("console.catalog.entities") },
              ]}
            />
            <ListSearch placeholder={t("console.catalog.searchPlaceholder")} />
          </div>
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <EmptyState icon={<Icon name="catalog" size={28} />} title={t("console.catalog.empty")} />
            ) : (
              <ul className="max-h-[640px] divide-y divide-border overflow-y-auto">
                {rows.map((row) => {
                  const on = current?.id === row.id;
                  const isIndicator = kind === "indicators";
                  const ind = row as IndicatorRow;
                  const ent = row as EntityRow;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(row.id)}
                        aria-pressed={on}
                        className={cn("flex w-full items-center gap-4 px-5 py-3 text-start transition-colors", on ? "bg-accent-soft/60" : "hover:bg-surface-sunken/60")}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{name(row)}</p>
                          <p className="truncate text-xs text-muted" dir="auto">
                            {row.aliases.slice(0, 4).join(" · ") || (locale === "ar" ? row.name_en : row.name_ar)}
                          </p>
                        </div>
                        <span className="hidden w-28 shrink-0 truncate text-xs text-muted sm:block">
                          {isIndicator ? ind.unit || "—" : t(`console.catalog.kinds.${oneOf(ENTITY_KINDS, ent.kind) ?? "other"}`)}
                        </span>
                        <span className="hidden w-32 shrink-0 truncate text-xs sm:block">
                          {isIndicator ? (ind.topic ? name(ind.topic) : "—") : t(`console.sources.level.${oneOf(ENTITY_LEVELS, ent.level) ?? "other"}`)}
                        </span>
                        <span className="num w-12 shrink-0 text-end text-sm text-muted">{formatNumber(isIndicator ? ind.figureCount : ent.sourceCount, locale)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit min-w-0 p-5">
          {!current ? (
            <p className="text-sm text-muted">{t("console.catalog.select")}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{name(current)}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {kind === "indicators"
                      ? t("console.catalog.details", {
                          topic: (current as IndicatorRow).topic ? name((current as IndicatorRow).topic!) : t("console.catalog.noTopic"),
                          unit: (current as IndicatorRow).unit || "—",
                          n: (current as IndicatorRow).figureCount,
                        })
                      : t("console.catalog.entityDetails", {
                          kind: t(`console.catalog.kinds.${oneOf(ENTITY_KINDS, (current as EntityRow).kind) ?? "other"}`),
                          level: t(`console.sources.level.${oneOf(ENTITY_LEVELS, (current as EntityRow).level) ?? "other"}`),
                          n: (current as EntityRow).sourceCount,
                        })}
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-subtle" dir="ltr">
                    {current.slug}
                  </p>
                </div>
                <Button size="sm" icon="edit" onClick={() => setDialog({ kind: kind === "indicators" ? "indicator" : "entity", id: current.id, nonce: Date.now() })}>
                  {t("common.edit")}
                </Button>
              </div>
              {kind === "indicators" && ((current as IndicatorRow).definition_ar || (current as IndicatorRow).definition_en) && (
                <p className="border-t border-border pt-3 text-sm text-muted">
                  {locale === "ar" ? (current as IndicatorRow).definition_ar : (current as IndicatorRow).definition_en}
                </p>
              )}
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer" dir="ltr" className="block truncate text-sm text-accent hover:underline">
                  {website}
                </a>
              )}
              <div className="border-t border-border pt-3">
                <Aliases key={current.id} aliases={current.aliases} onSave={saveAliases} pending={pending} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {dialog?.kind === "indicator" && (
        <IndicatorDialog
          key={dialog.nonce}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          initial={editing ? indicatorInput(editing as IndicatorRow) : EMPTY_INDICATOR}
          topics={topics}
          onSaved={(id) => setSelected(id)}
        />
      )}
      {dialog?.kind === "entity" && (
        <EntityDialog key={dialog.nonce} open onOpenChange={(open) => !open && setDialog(null)} initial={editing ? entityInput(editing as EntityRow) : EMPTY_ENTITY} />
      )}
    </>
  );
}
