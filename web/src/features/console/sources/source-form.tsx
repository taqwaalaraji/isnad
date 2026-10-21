"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Checkbox, Field, Input, Radio, Select, Textarea } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { createSource, type SourceInput, updateSource } from "../actions";
import { ACCESS_METHODS, FREQUENCIES, SOURCE_TYPES } from "../constants";
import { normalizeDomain, slugify } from "../domains";
import type { FormOptions } from "../queries";

type Errors = Partial<Record<string, MessageKey>>;

export type SourceFormValues = SourceInput & { id?: string };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border pt-5 first:border-0 first:pt-0">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function SourceForm({ options, initial }: { options: FormOptions; initial?: SourceFormValues }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const editing = !!initial?.id;
  const [values, setValues] = useState<SourceFormValues>(
    initial ?? {
      entityId: null,
      nameAr: "",
      nameEn: "",
      slug: "",
      tier: 2,
      type: "publications",
      homepageUrl: "",
      dataUrl: "",
      domains: [],
      accessMethods: [],
      updateFrequency: null,
      languages: ["ar"],
      topicIds: [],
      descriptionAr: "",
      descriptionEn: "",
      termsUrl: "",
    },
  );
  const [domainsText, setDomainsText] = useState((initial?.domains ?? []).join(", "));
  const [slugTouched, setSlugTouched] = useState(editing);
  const [terms, setTerms] = useState(false);
  const [doc, setDoc] = useState({ title: "", url: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();

  function set<K extends keyof SourceFormValues>(key: K, value: SourceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function toggle<K extends "accessMethods" | "languages" | "topicIds">(key: K, item: string) {
    setValues((v) => {
      const list = v[key] as string[];
      return { ...v, [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item] };
    });
  }

  function submit() {
    const domains = domainsText
      .split(/[\s,،]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    const input: SourceInput = { ...values, domains };
    const local: Errors = {};
    if (!domains.length || domains.some((d) => !normalizeDomain(d))) local.domains = "console.sources.errors.domains";
    if (!editing && !terms) local.terms = "console.sources.errors.terms";
    if (Object.keys(local).length) {
      setErrors(local);
      toast.error(t("console.sources.errors.form"));
      return;
    }
    startTransition(async () => {
      const res = editing
        ? await updateSource(initial!.id!, input)
        : await createSource({ ...input, locale, termsConfirmed: terms, firstDocument: doc.url.trim() ? doc : null });
      if (res.ok) {
        toast.success(t("console.sources.saved"));
        router.push(`/${locale}/console/sources/${initial!.id}`);
        return;
      }
      if (res.fields) setErrors(res.fields as Errors);
      toast.error(t(res.error));
    });
  }

  const err = (key: string) => (errors[key] ? t(errors[key]!) : undefined);

  return (
    <Card className="space-y-6 p-5 md:p-6">
      <Section title={t("console.sources.sections.identity")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("console.sources.nameAr")} htmlFor="nameAr" error={err("nameAr")}>
            <Input id="nameAr" dir="rtl" value={values.nameAr} onChange={(e) => set("nameAr", e.target.value)} aria-invalid={!!errors.nameAr} />
          </Field>
          <Field label={t("console.sources.nameEn")} htmlFor="nameEn" error={err("nameEn")}>
            <Input
              id="nameEn"
              dir="ltr"
              value={values.nameEn}
              onChange={(e) => {
                set("nameEn", e.target.value);
                if (!slugTouched) set("slug", slugify(e.target.value));
              }}
              aria-invalid={!!errors.nameEn}
            />
          </Field>
          <Field label={t("console.sources.slug")} htmlFor="slug" hint={t("console.sources.slugHint")} error={err("slug")}>
            <Input
              id="slug"
              dir="ltr"
              value={values.slug}
              disabled={editing}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase());
              }}
              aria-invalid={!!errors.slug}
            />
          </Field>
          <Field label={t("console.sources.entity")} htmlFor="entity" hint={t("console.sources.entityHint")}>
            <Select id="entity" value={values.entityId ?? ""} onChange={(e) => set("entityId", e.target.value || null)}>
              <option value="">{t("console.sources.entityNone")}</option>
              {options.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {locale === "ar" ? e.name_ar : e.name_en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("console.sources.type")} htmlFor="type" error={err("type")}>
            <Select id="type" value={values.type} onChange={(e) => set("type", e.target.value as SourceFormValues["type"])}>
              {SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`console.sources.types.${type}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("console.sources.homepage")} htmlFor="homepage" error={err("homepageUrl")}>
            <Input id="homepage" dir="ltr" type="url" placeholder="https://" value={values.homepageUrl ?? ""} onChange={(e) => set("homepageUrl", e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("console.sources.descriptionAr")} htmlFor="descriptionAr">
            <Textarea id="descriptionAr" dir="rtl" rows={3} value={values.descriptionAr ?? ""} onChange={(e) => set("descriptionAr", e.target.value)} />
          </Field>
          <Field label={t("console.sources.descriptionEn")} htmlFor="descriptionEn">
            <Textarea id="descriptionEn" dir="ltr" rows={3} value={values.descriptionEn ?? ""} onChange={(e) => set("descriptionEn", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title={t("console.sources.sections.collection")}>
        <Field label={t("console.sources.domains")} htmlFor="domains" hint={t("console.sources.domainsHint")} error={err("domains")}>
          <Input
            id="domains"
            dir="ltr"
            placeholder="scad.gov.ae, data.abudhabi"
            value={domainsText}
            onChange={(e) => {
              setDomainsText(e.target.value);
              setErrors((x) => ({ ...x, domains: undefined }));
            }}
            aria-invalid={!!errors.domains}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("console.sources.dataUrl")} htmlFor="dataUrl" error={err("dataUrl")}>
            <Input id="dataUrl" dir="ltr" type="url" placeholder="https://" value={values.dataUrl ?? ""} onChange={(e) => set("dataUrl", e.target.value)} />
          </Field>
          <Field label={t("console.sources.frequency")} htmlFor="frequency">
            <Select id="frequency" value={values.updateFrequency ?? ""} onChange={(e) => set("updateFrequency", (e.target.value || null) as SourceFormValues["updateFrequency"])}>
              <option value="">—</option>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {t(`console.sources.frequencies.${f}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("console.sources.access")}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {ACCESS_METHODS.map((m) => (
              <Checkbox key={m} label={t(`console.sources.accessMethods.${m}`)} checked={values.accessMethods.includes(m)} onChange={() => toggle("accessMethods", m)} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("console.sources.languages")}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {(["ar", "en"] as const).map((l) => (
              <Checkbox key={l} label={t(`console.sources.languageNames.${l}`)} checked={values.languages.includes(l)} onChange={() => toggle("languages", l)} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("console.sources.topics")}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {options.topics.map((topic) => (
              <Checkbox
                key={topic.id}
                label={locale === "ar" ? topic.name_ar : topic.name_en}
                checked={values.topicIds.includes(topic.id)}
                onChange={() => toggle("topicIds", topic.id)}
              />
            ))}
          </div>
        </fieldset>
      </Section>

      <Section title={t("console.sources.sections.trust")}>
        <fieldset aria-invalid={!!errors.tier}>
          <legend className="sr-only">{t("console.sources.tier")}</legend>
          <div className="grid gap-3 md:grid-cols-3">
            {([1, 2, 3] as const).map((tier) => (
              <label
                key={tier}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm transition-colors",
                  values.tier === tier ? "border-accent bg-accent-soft/40" : "border-border hover:border-border-strong",
                )}
              >
                <Radio label={t(`tier.${tier}`)} name="tier" checked={values.tier === tier} onChange={() => set("tier", tier)} />
                <span className="text-xs text-muted">{t(`console.sources.tierHint.${tier}`)}</span>
              </label>
            ))}
          </div>
          {errors.tier && <p className="mt-2 text-xs text-differ-text">{t(errors.tier)}</p>}
        </fieldset>
        <Field label={t("console.sources.termsUrl")} htmlFor="termsUrl" error={err("termsUrl")}>
          <Input id="termsUrl" dir="ltr" type="url" placeholder="https://" value={values.termsUrl ?? ""} onChange={(e) => set("termsUrl", e.target.value)} />
        </Field>
        {!editing && (
          <div>
            <Checkbox
              label={t("console.sources.terms")}
              checked={terms}
              onChange={(e) => {
                setTerms(e.target.checked);
                setErrors((x) => ({ ...x, terms: undefined }));
              }}
            />
            {errors.terms && <p className="mt-1.5 text-xs text-differ-text">{t(errors.terms)}</p>}
          </div>
        )}
      </Section>

      {!editing && (
        <Section title={t("console.sources.sections.documents")}>
          <p className="-mt-2 text-xs text-muted">{t("console.sources.firstDocumentHint")}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("console.sources.documentTitle")} htmlFor="docTitle" error={err("firstDocument")}>
              <Input id="docTitle" dir="auto" value={doc.title} onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))} />
            </Field>
            <Field label={t("console.sources.documentUrl")} htmlFor="docUrl">
              <Input id="docUrl" dir="ltr" type="url" placeholder="https://" value={doc.url} onChange={(e) => setDoc((d) => ({ ...d, url: e.target.value }))} />
            </Field>
          </div>
        </Section>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-5">
        <Button variant="ghost" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" icon="check" loading={pending} onClick={submit}>
          {editing ? t("console.sources.save") : t("console.sources.submit")}
        </Button>
      </div>
    </Card>
  );
}
