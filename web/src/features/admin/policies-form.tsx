"use client";

import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { type PoliciesInput, savePolicies } from "./actions";
import type { NewsroomPolicies } from "./queries";

const RETENTION = [30, 60, 90, 180, 365];

function Row({ title, hint, control }: { title: string; hint?: string; control: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border px-5 py-4 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function PoliciesForm({ policies }: { policies: NewsroomPolicies }) {
  const { t, locale } = useI18n();
  const initial: PoliciesInput = {
    require_approval_for_differs: policies.require_approval_for_differs,
    escalate_on_verifier_objection: policies.escalate_on_verifier_objection,
    default_visibility: policies.default_visibility,
    media_retention_days: policies.media_retention_days,
    brand_isnad_note: policies.brand_isnad_note,
    telegram_enabled: policies.telegram_enabled,
  };
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const set = <K extends keyof PoliciesInput>(key: K, v: PoliciesInput[K]) => setValue((prev) => ({ ...prev, [key]: v }));
  const retention = RETENTION.includes(value.media_retention_days) ? RETENTION : [...RETENTION, value.media_retention_days].sort((a, b) => a - b);

  function save() {
    startTransition(async () => {
      const res = await savePolicies(value);
      if (res.ok) {
        setSaved(value);
        toast.success(t("admin.policies.saved"));
      } else toast.error(t(res.error));
    });
  }

  return (
    <>
      <div className="-mt-2 mb-5 flex justify-end">
        <Button variant="primary" icon="check" loading={pending} disabled={!dirty} onClick={save}>
          {t("admin.policies.save")}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("admin.policies.reviewTitle")} />
            <Row
              title={t("admin.policies.requireApproval")}
              hint={t("admin.policies.requireApprovalHint")}
              control={<Switch label={t("admin.policies.requireApproval")} checked={value.require_approval_for_differs} onCheckedChange={(v) => set("require_approval_for_differs", v)} />}
            />
            <Row
              title={t("admin.policies.escalateOnVerifier")}
              hint={t("admin.policies.escalateOnVerifierHint")}
              control={<Switch label={t("admin.policies.escalateOnVerifier")} checked={value.escalate_on_verifier_objection} onCheckedChange={(v) => set("escalate_on_verifier_objection", v)} />}
            />
          </Card>
          <Card>
            <CardHeader title={t("admin.policies.privacyTitle")} />
            <Row
              title={t("admin.policies.defaultVisibility")}
              hint={t("admin.policies.defaultVisibilityHint")}
              control={
                <Select
                  aria-label={t("admin.policies.defaultVisibility")}
                  value={value.default_visibility}
                  onChange={(e) => set("default_visibility", e.target.value as PoliciesInput["default_visibility"])}
                  className="w-44"
                >
                  {(["newsroom", "desk", "private"] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`admin.policies.visibility.${v}`)}
                    </option>
                  ))}
                </Select>
              }
            />
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("admin.policies.noteTitle")} />
            <Row
              title={t("admin.policies.brandNote")}
              hint={t("admin.policies.brandNoteHint")}
              control={<Switch label={t("admin.policies.brandNote")} checked={value.brand_isnad_note} onCheckedChange={(v) => set("brand_isnad_note", v)} />}
            />
            <Row
              title={t("admin.policies.telegram")}
              hint={t("admin.policies.telegramHint")}
              control={<Switch label={t("admin.policies.telegram")} checked={value.telegram_enabled} onCheckedChange={(v) => set("telegram_enabled", v)} />}
            />
          </Card>
          <Card>
            <CardHeader title={t("admin.policies.retentionTitle")} />
            <div className="grid grid-cols-1 gap-4 px-5 pb-2 sm:grid-cols-2">
              <div>
                <label htmlFor="retention" className="mb-1.5 block text-xs font-medium text-muted">
                  {t("admin.policies.retention")}
                </label>
                <Select id="retention" value={value.media_retention_days} onChange={(e) => set("media_retention_days", Number(e.target.value))}>
                  {retention.map((d) => (
                    <option key={d} value={d}>
                      {t("admin.policies.retentionDays", { n: formatNumber(d, locale) })}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">{t("admin.policies.transcripts")}</p>
                <p className="flex h-10 items-center rounded-md border border-border bg-surface-sunken px-3 text-sm text-muted">{t("admin.policies.always")}</p>
              </div>
            </div>
            <p className="px-5 pb-4 text-xs text-muted">{t("admin.policies.retentionHint")}</p>
          </Card>
          <Card className="px-5 py-4">
            <p className="text-sm font-medium">{t("admin.policies.limitTitle")}</p>
            <p className="mt-1 text-xs text-muted">
              {policies.monthly_check_limit
                ? t("admin.policies.limitValue", { n: formatNumber(policies.monthly_check_limit, locale) })
                : t("admin.policies.limitNone")}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
