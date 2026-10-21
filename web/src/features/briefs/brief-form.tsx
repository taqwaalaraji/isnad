"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, FieldError, Input, SearchInput, Select } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";
import { normalizeAr } from "@/lib/text";

import { createBrief } from "./actions";
import type { BriefFormOptions } from "./queries";
import { PERIODS } from "./types";

const LEVELS = ["federal", "emirate", "international", "other"] as const;

export function BriefForm({ options, initialEntity, initialTopic }: { options: BriefFormOptions; initialEntity?: string; initialTopic?: string }) {
  const { t, locale } = useI18n();
  const [entityId, setEntityId] = useState(initialEntity && options.entities.some((e) => e.id === initialEntity) ? initialEntity : "");
  const [entityQuery, setEntityQuery] = useState("");
  const [topicId, setTopicId] = useState(initialTopic && options.topics.some((tp) => tp.id === initialTopic) ? initialTopic : "");
  const [guestName, setGuestName] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [periodMonths, setPeriodMonths] = useState<number>(12);
  const [revisions, setRevisions] = useState(true);
  const [statements, setStatements] = useState(true);
  const [questions, setQuestions] = useState(true);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();

  const name = (e: { name_ar: string; name_en: string }) => (locale === "ar" ? e.name_ar : e.name_en);
  const q = normalizeAr(entityQuery.trim());
  const grouped = useMemo(
    () =>
      LEVELS.map((level) => ({
        level,
        items: options.entities.filter(
          (e) => e.level === level && (!q || e.id === entityId || normalizeAr(`${e.name_ar} ${e.name_en}`).includes(q)),
        ),
      })).filter((g) => g.items.length > 0),
    [options.entities, q, entityId],
  );

  function submit() {
    setError(null);
    if (!entityId) return setError("briefs.errors.entityRequired");
    startTransition(async () => {
      const res = await createBrief({
        locale,
        entityId,
        topicId: topicId || null,
        guestName,
        interviewDate: interviewDate || null,
        periodMonths,
        revisions,
        statements,
        questions,
      });
      if (res && !res.ok) {
        setError(res.error);
        toast.error(t(res.error));
      }
    });
  }

  return (
    <Card className="p-5 md:p-6">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <Field label={t("briefs.entity")} htmlFor="brief-entity" hint={t("briefs.entityHint")}>
            <div className="space-y-2">
              <SearchInput value={entityQuery} onChange={(e) => setEntityQuery(e.target.value)} placeholder={t("briefs.entitySearch")} aria-label={t("briefs.entitySearch")} />
              <Select id="brief-entity" value={entityId} onChange={(e) => setEntityId(e.target.value)} required aria-invalid={error === "briefs.errors.entityRequired" || undefined}>
                <option value="">{t("briefs.chooseEntity")}</option>
                {grouped.map((g) => (
                  <optgroup key={g.level} label={t(`briefs.levels.${g.level}`)}>
                    {g.items.map((e) => (
                      <option key={e.id} value={e.id}>
                        {name(e)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("briefs.topic")} htmlFor="brief-topic">
            <Select id="brief-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">{t("briefs.anyTopic")}</option>
              {options.topics.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {name(tp)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("briefs.period")} htmlFor="brief-period">
            <Select id="brief-period" value={periodMonths} onChange={(e) => setPeriodMonths(Number(e.target.value))}>
              {PERIODS.map((m) => (
                <option key={m} value={m}>
                  {t("briefs.lastMonths", { n: m })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("briefs.guest")} htmlFor="brief-guest" hint={t("common.optional")}>
            <Input id="brief-guest" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t("briefs.guestPlaceholder")} />
          </Field>
          <Field label={t("briefs.interviewDate")} htmlFor="brief-date" hint={t("common.optional")}>
            <Input id="brief-date" type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("briefs.include")}</legend>
          <div className="flex flex-col gap-2.5">
            <Checkbox label={t("briefs.optionRevisions")} checked={revisions} onChange={(e) => setRevisions(e.target.checked)} />
            <Checkbox label={t("briefs.optionStatements")} checked={statements} onChange={(e) => setStatements(e.target.checked)} />
            <Checkbox label={t("briefs.optionQuestions")} checked={questions} onChange={(e) => setQuestions(e.target.checked)} />
          </div>
        </fieldset>
        {error && <FieldError>{t(error)}</FieldError>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" icon="sparkles" loading={pending}>
            {t("briefs.create")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
