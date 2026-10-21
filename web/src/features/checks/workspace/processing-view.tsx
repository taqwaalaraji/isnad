"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";
import type { CheckStage } from "@/lib/types";

import { archiveCheck, recheck } from "../actions";
import type { CheckDetail } from "../queries";
import { ClaimCard } from "./claim-card";
import type { Capabilities } from "./types";

const MEDIA_STAGES: CheckStage[] = ["preparing", "transcribing", "extracting", "checking"];
const TEXT_STAGES: CheckStage[] = ["preparing", "extracting", "checking"];

const ERROR_CODES = [
  "file_missing",
  "no_audio",
  "too_long",
  "speech_unavailable",
  "no_speech",
  "no_text",
  "link_video",
  "link_failed",
  "link_unsupported",
] as const;

type Progress = {
  transcribed_ms?: number;
  claims_total?: number;
  claims_checked?: number;
  claims_found?: number;
  [key: `${string}_started_at`]: number | undefined;
};

export function failureKey(error: string | null): MessageKey {
  const code = ERROR_CODES.find((c) => error?.startsWith(c));
  return code ? (`check.failure.${code}` as MessageKey) : "processing.failedBody";
}

function Elapsed({ since }: { since?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!since) return null;
  return <span className="num">{Math.max(0, Math.round(now / 1000 - since))}s</span>;
}

export function ProcessingView({ detail, caps }: { detail: CheckDetail; caps: Capabilities }) {
  const { t } = useI18n();
  const { check, claims } = detail;
  const [pending, startTransition] = useTransition();
  const progress = (check.progress ?? {}) as Progress;
  const stages = check.input_kind === "video" || check.input_kind === "audio" ? MEDIA_STAGES : TEXT_STAGES;
  const failed = check.status === "failed";
  const currentIndex = check.stage === "done" ? stages.length : stages.indexOf(check.stage as CheckStage);
  const total = progress.claims_total ?? 0;
  const checked = progress.claims_checked ?? 0;
  const overall = failed
    ? 0
    : Math.round(((Math.max(0, currentIndex) + (check.stage === "checking" && total ? checked / total : 0)) / stages.length) * 100);

  function act(action: () => Promise<{ ok: boolean }>, message: string) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) toast.success(message);
      else toast.error(t("errors.generic"));
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
      <Card className="h-fit p-5">
        <h2 className="mb-4 text-sm font-semibold">{t("processing.stagesTitle")}</h2>
        {failed ? (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-md bg-differ-tint p-3 text-sm text-differ-text">
              <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">{t("processing.failedTitle")}</p>
                <p className="mt-1">{t(failureKey(check.error))}</p>
              </div>
            </div>
            {caps.canEdit && (
              <Button variant="primary" icon="refresh" loading={pending} onClick={() => act(() => recheck(check.id), t("check.recheckStarted"))}>
                {t("common.retry")}
              </Button>
            )}
          </div>
        ) : (
          <>
            <ol className="space-y-0">
              {stages.map((stage, i) => {
                const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "waiting";
                return (
                  <li key={stage} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < stages.length - 1 && (
                      <span className={cn("absolute start-[11px] top-6 bottom-0 w-px", state === "done" ? "bg-accent" : "bg-border")} />
                    )}
                    <span
                      className={cn(
                        "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border",
                        state === "done" && "border-accent bg-accent text-on-accent",
                        state === "active" && "border-accent bg-surface text-accent",
                        state === "waiting" && "border-border bg-surface text-subtle",
                      )}
                    >
                      {state === "done" ? (
                        <Icon name="check" size={14} />
                      ) : state === "active" ? (
                        <Icon name="loader" size={14} className="animate-spin" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className={cn("text-sm font-medium", state === "waiting" && "text-muted")}>{t(`stage.${stage}` as MessageKey)}</p>
                      <p className="text-xs text-muted">
                        {stage === "checking" && total > 0 && state !== "waiting"
                          ? t("processing.claimsStat", { checked, total })
                          : stage === "transcribing" && state === "done" && progress.transcribed_ms
                            ? t("processing.transcribedStat", { seconds: Math.round(progress.transcribed_ms / 1000) })
                            : t(`stage.${stage}Hint` as MessageKey)}
                        {state === "active" && (
                          <>
                            {" · "}
                            <Elapsed since={progress[`${stage}_started_at`]} />
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <ProgressBar value={overall} label={t("processing.stagesTitle")} className="mt-5" />
          </>
        )}
        {caps.canEdit && !failed && (
          <Button
            variant="ghost"
            size="sm"
            icon="x"
            className="mt-4"
            loading={pending}
            onClick={() => act(() => archiveCheck(check.id), t("check.cancelled"))}
          >
            {t("check.cancel")}
          </Button>
        )}
      </Card>

      {(!failed || claims.length > 0) && (
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-sm font-semibold">{t("processing.claimsSoFar")}</h2>
          <span className="num rounded-full bg-surface-sunken px-2 text-xs text-muted">{claims.filter((c) => c.checkable).length}</span>
        </div>
        {!failed && (
          <p className="mb-4 flex items-start gap-2 rounded-md bg-accent-soft/60 p-3 text-xs text-text">
            <Icon name="info" size={14} className="mt-0.5 shrink-0 text-accent" />
            {t("processing.leaveNote")}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {claims
            .filter((c) => c.checkable)
            .map((claim) => (
              <ClaimCard key={claim.id} claim={claim} selected={false} active={false} onSelect={() => {}} />
            ))}
          {!failed &&
            Array.from({ length: claims.length ? 2 : 4 }, (_, i) => (
              <div key={`s${i}`} className="h-[116px] animate-pulse rounded-md border border-border bg-surface-sunken/50" />
            ))}
        </div>
      </Card>
      )}
    </div>
  );
}
