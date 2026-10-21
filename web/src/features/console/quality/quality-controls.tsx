"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { runEval, updateModelSetting } from "../actions";
import { ESCALATING_TASKS, modelChoices, OPTIONAL_TASKS, TEXT_MODELS, THINKING_LEVELS } from "../constants";
import type { ModelSettingRow } from "../queries";

export function RunEvalButton({ running }: { running: boolean }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="primary"
      icon="refresh"
      loading={pending}
      disabled={running}
      onClick={() =>
        startTransition(async () => {
          const res = await runEval();
          if (res.ok) toast.success(t("console.quality.evalQueued"));
          else toast.error(t(res.error));
        })
      }
    >
      {running ? t("console.quality.evalRunning") : t("console.quality.runEval")}
    </Button>
  );
}

type Thinking = (typeof THINKING_LEVELS)[number];

export function EditModelSetting({ setting, taskName }: { setting: ModelSettingRow; taskName: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState(setting.model);
  const [effort, setEffort] = useState<Thinking>((THINKING_LEVELS as readonly string[]).includes(setting.effort) ? (setting.effort as Thinking) : "low");
  const [escalation, setEscalation] = useState(setting.escalation_model ?? "");
  const [maxTokens, setMaxTokens] = useState(setting.max_tokens ? String(setting.max_tokens) : "");
  const [enabled, setEnabled] = useState(setting.enabled);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();
  const optional = (OPTIONAL_TASKS as readonly string[]).includes(setting.task);
  const escalates = (ESCALATING_TASKS as readonly string[]).includes(setting.task);
  const transcription = setting.task === "transcribe";
  const models = modelChoices(setting.task);

  function save() {
    setError(null);
    const tokens = maxTokens.trim() ? Number(maxTokens) : null;
    if (tokens !== null && (!Number.isInteger(tokens) || tokens < 256 || tokens > 128000)) return setError("console.quality.errors.form");
    if (escalation && escalation === model) return setError("console.quality.errors.escalationSame");
    startTransition(async () => {
      const res = await updateModelSetting({ task: setting.task, model, effort, escalationModel: escalation || null, maxTokens: tokens, enabled });
      if (!res.ok) return setError(res.error);
      toast.success(t("console.quality.settingSaved"));
      setOpen(false);
    });
  }

  return (
    <>
      <IconButton icon="edit" size="sm" label={t("console.quality.edit")} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent
            size="sm"
            closeLabel={t("common.close")}
            title={t("console.quality.editTitle", { task: taskName })}
            description={setting.task}
            footer={
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" icon="check" loading={pending} onClick={save}>
                  {t("common.save")}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <Field label={t("console.quality.model")} htmlFor="ms-model">
                <Select id="ms-model" dir="ltr" value={model} onChange={(e) => setModel(e.target.value)}>
                  {[...new Set([...models, setting.model])].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              {escalates && (
                <Field label={t("console.quality.escalation")} htmlFor="ms-escalation" hint={t("console.quality.escalationHint")}>
                  <Select id="ms-escalation" dir="ltr" value={escalation} onChange={(e) => setEscalation(e.target.value)}>
                    <option value="">{t("console.quality.escalationNone")}</option>
                    {TEXT_MODELS.filter((m) => m !== model).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {!transcription && (
                <>
                  <Field label={t("console.quality.effort")} htmlFor="ms-effort" hint={t("console.quality.effortHint")}>
                    <Select id="ms-effort" dir="ltr" value={effort} onChange={(e) => setEffort(e.target.value as Thinking)}>
                      {THINKING_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("console.quality.maxTokens")} htmlFor="ms-tokens" hint={t("console.quality.maxTokensHint")}>
                    <Input id="ms-tokens" dir="ltr" inputMode="numeric" className="num" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
                  </Field>
                </>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{enabled ? t("console.quality.enabled") : t("console.quality.disabled")}</span>
                {optional ? (
                  <Switch checked={enabled} onCheckedChange={setEnabled} label={t("console.quality.enabled")} />
                ) : (
                  <span className="text-xs text-muted">{t("console.quality.required")}</span>
                )}
              </div>
              {error && (
                <p role="alert" className="rounded-md bg-differ-tint px-3 py-2 text-sm text-differ-text">
                  {t(error)}
                </p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
