"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { type EntityInput, type IndicatorInput, saveEntity, saveIndicator } from "../actions";
import { EMIRATES, ENTITY_KINDS, ENTITY_LEVELS, FREQUENCIES, GEOGRAPHIES, GEOGRAPHY_AR, UNIT_KINDS } from "../constants";
import { slugify } from "../domains";

type Topic = { id: string; slug: string; name_ar: string; name_en: string };

export const EMPTY_INDICATOR: IndicatorInput = {
  id: null,
  slug: "",
  nameAr: "",
  nameEn: "",
  topicId: null,
  unitKind: "count",
  unit: "",
  frequency: null,
  defaultGeography: "UAE",
  aliases: [],
  definitionAr: "",
  definitionEn: "",
};

export const EMPTY_ENTITY: EntityInput = {
  id: null,
  slug: "",
  nameAr: "",
  nameEn: "",
  shortNameAr: "",
  shortNameEn: "",
  kind: "other",
  level: "federal",
  emirate: "",
  website: "",
  aliases: [],
};

function AliasesField({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  return (
    <Field label={t("console.catalog.aliases")} htmlFor="aliases" hint={t("console.catalog.aliasAdd")}>
      <Input
        id="aliases"
        dir="auto"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            onChange([...new Set([...value, draft.trim()])]);
            setDraft("");
          }
        }}
      />
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((alias) => (
            <span key={alias} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs" dir="auto">
              {alias}
              <button type="button" aria-label={`${t("common.remove")} ${alias}`} onClick={() => onChange(value.filter((a) => a !== alias))} className="text-muted hover:text-differ-text">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </Field>
  );
}

/** Create or edit an indicator; with `assignFigures`, the new indicator is given to those pending figures. */
export function IndicatorDialog({
  open,
  onOpenChange,
  initial,
  topics,
  assignFigures,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: IndicatorInput;
  topics: Topic[];
  assignFigures?: string[];
  onSaved?: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [values, setValues] = useState<IndicatorInput>(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<IndicatorInput>) => setValues((v) => ({ ...v, ...patch }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveIndicator(values, assignFigures ?? []);
      if (!res.ok) return setError(res.error);
      toast.success(assignFigures?.length ? t("console.proposals.created", { n: assignFigures.length }) : t("console.catalog.saved"));
      onOpenChange(false);
      onSaved?.(res.data!);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          size="lg"
          closeLabel={t("common.close")}
          title={values.id ? t("console.catalog.editIndicator") : t("console.catalog.newIndicator")}
          footer={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="primary" icon="check" loading={pending} onClick={submit}>
                {t("common.save")}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("console.catalog.nameAr")} htmlFor="ind-ar">
              <Input id="ind-ar" dir="rtl" value={values.nameAr} onChange={(e) => set({ nameAr: e.target.value })} />
            </Field>
            <Field label={t("console.catalog.nameEn")} htmlFor="ind-en">
              <Input
                id="ind-en"
                dir="ltr"
                value={values.nameEn}
                onChange={(e) => set({ nameEn: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
              />
            </Field>
            <Field label={t("console.catalog.slug")} htmlFor="ind-slug" hint={t("console.sources.slugHint")}>
              <Input
                id="ind-slug"
                dir="ltr"
                value={values.slug}
                disabled={!!values.id}
                onChange={(e) => {
                  setSlugTouched(true);
                  set({ slug: e.target.value.toLowerCase() });
                }}
              />
            </Field>
            <Field label={t("console.catalog.topic")} htmlFor="ind-topic">
              <Select id="ind-topic" value={values.topicId ?? ""} onChange={(e) => set({ topicId: e.target.value || null })}>
                <option value="">{t("console.catalog.noTopic")}</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {locale === "ar" ? topic.name_ar : topic.name_en}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("console.catalog.unitKind")} htmlFor="ind-kind">
              <Select id="ind-kind" value={values.unitKind} onChange={(e) => set({ unitKind: e.target.value as IndicatorInput["unitKind"] })}>
                {UNIT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`console.catalog.unitKinds.${k}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("console.catalog.unit")} htmlFor="ind-unit">
              <Input id="ind-unit" dir="ltr" placeholder="visitor, AED, %" value={values.unit} onChange={(e) => set({ unit: e.target.value })} />
            </Field>
            <Field label={t("console.catalog.frequency")} htmlFor="ind-freq">
              <Select id="ind-freq" value={values.frequency ?? ""} onChange={(e) => set({ frequency: (e.target.value || null) as IndicatorInput["frequency"] })}>
                <option value="">—</option>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {t(`console.sources.frequencies.${f}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("console.catalog.defaultGeography")} htmlFor="ind-geo">
              <Select id="ind-geo" value={values.defaultGeography} onChange={(e) => set({ defaultGeography: e.target.value })}>
                {GEOGRAPHIES.map((g) => (
                  <option key={g} value={g}>
                    {locale === "ar" ? GEOGRAPHY_AR[g] : g}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("console.catalog.definitionAr")} htmlFor="ind-def-ar" className="sm:col-span-2">
              <Textarea id="ind-def-ar" dir="rtl" rows={2} value={values.definitionAr ?? ""} onChange={(e) => set({ definitionAr: e.target.value })} />
            </Field>
            <Field label={t("console.catalog.definitionEn")} htmlFor="ind-def-en" className="sm:col-span-2">
              <Textarea id="ind-def-en" dir="ltr" rows={2} value={values.definitionEn ?? ""} onChange={(e) => set({ definitionEn: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <AliasesField value={values.aliases} onChange={(aliases) => set({ aliases })} />
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-md bg-differ-tint px-3 py-2 text-sm text-differ-text">
              {t(error)}
            </p>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

export function EntityDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (open: boolean) => void; initial: EntityInput }) {
  const { t, locale } = useI18n();
  const [values, setValues] = useState<EntityInput>(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<EntityInput>) => setValues((v) => ({ ...v, ...patch }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveEntity(values);
      if (!res.ok) return setError(res.error);
      toast.success(t("console.catalog.saved"));
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          size="lg"
          closeLabel={t("common.close")}
          title={values.id ? t("console.catalog.editEntity") : t("console.catalog.newEntity")}
          footer={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="primary" icon="check" loading={pending} onClick={submit}>
                {t("common.save")}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("console.catalog.nameAr")} htmlFor="ent-ar">
              <Input id="ent-ar" dir="rtl" value={values.nameAr} onChange={(e) => set({ nameAr: e.target.value })} />
            </Field>
            <Field label={t("console.catalog.nameEn")} htmlFor="ent-en">
              <Input id="ent-en" dir="ltr" value={values.nameEn} onChange={(e) => set({ nameEn: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
            </Field>
            <Field label={t("console.catalog.shortNameAr")} htmlFor="ent-short-ar">
              <Input id="ent-short-ar" dir="rtl" value={values.shortNameAr ?? ""} onChange={(e) => set({ shortNameAr: e.target.value })} />
            </Field>
            <Field label={t("console.catalog.shortNameEn")} htmlFor="ent-short-en">
              <Input id="ent-short-en" dir="ltr" value={values.shortNameEn ?? ""} onChange={(e) => set({ shortNameEn: e.target.value })} />
            </Field>
            <Field label={t("console.catalog.slug")} htmlFor="ent-slug" hint={t("console.sources.slugHint")}>
              <Input
                id="ent-slug"
                dir="ltr"
                value={values.slug}
                disabled={!!values.id}
                onChange={(e) => {
                  setSlugTouched(true);
                  set({ slug: e.target.value.toLowerCase() });
                }}
              />
            </Field>
            <Field label={t("console.catalog.kind")} htmlFor="ent-kind">
              <Select id="ent-kind" value={values.kind} onChange={(e) => set({ kind: e.target.value as EntityInput["kind"] })}>
                {ENTITY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`console.catalog.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("console.catalog.level")} htmlFor="ent-level">
              <Select id="ent-level" value={values.level} onChange={(e) => set({ level: e.target.value as EntityInput["level"] })}>
                {ENTITY_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`console.sources.level.${l}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("console.catalog.emirate")} htmlFor="ent-emirate">
              <Select id="ent-emirate" value={values.emirate ?? ""} onChange={(e) => set({ emirate: e.target.value })}>
                <option value="">—</option>
                {EMIRATES.map((e) => (
                  <option key={e} value={e}>
                    {locale === "ar" ? GEOGRAPHY_AR[e] : e}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("console.catalog.website")} htmlFor="ent-web" className="sm:col-span-2">
              <Input id="ent-web" dir="ltr" type="url" placeholder="https://" value={values.website ?? ""} onChange={(e) => set({ website: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <AliasesField value={values.aliases} onChange={(aliases) => set({ aliases })} />
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-md bg-differ-tint px-3 py-2 text-sm text-differ-text">
              {t(error)}
            </p>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
