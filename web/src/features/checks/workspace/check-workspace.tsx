"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Checkbox } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { formatDate, formatRelative } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import type { CheckDetail } from "../queries";
import { ClaimCard } from "./claim-card";
import { DocumentStage } from "./document-stage";
import { EvidencePanel } from "./evidence-panel";
import { type MediaHandle, MediaStage } from "./media-stage";
import { Transcript } from "./transcript";
import type { Capabilities, WorkspaceClaim } from "./types";

type Tab = "numbers" | "transcript" | "activity";

// Notes the system writes on decisions; shown as text only when a person wrote them.
const SYSTEM_NOTES = new Set(["approve_matches", "approved_with_check", "verifier_objection"]);

export function CheckWorkspace({ detail, caps, initialClaim }: { detail: CheckDetail; caps: Capabilities; initialClaim?: string }) {
  const { t, locale } = useI18n();
  const { check, segments, claims, media, urls, decisions, comments } = detail;
  const isMedia = (check.input_kind === "video" || check.input_kind === "audio") && !!media;

  const checkable = useMemo(() => claims.filter((c) => c.checkable), [claims]);
  const unchecked = useMemo(() => claims.filter((c) => !c.checkable), [claims]);
  const [tab, setTab] = useState<Tab>("numbers");
  const [onlyPending, setOnlyPending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => (initialClaim && checkable.some((c) => c.id === initialClaim) ? initialClaim : null) ?? firstToReview(checkable)?.id ?? null,
  );
  const [currentMs, setCurrentMs] = useState<number | null>(isMedia ? 0 : null);
  const [follow, setFollow] = useState(true);
  const [pauseAtIssues, setPauseAtIssues] = useState(false);
  const mediaRef = useRef<MediaHandle>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());

  const segmentIdx = useMemo(() => new Map(segments.map((s) => [s.id, s.idx])), [segments]);
  const selected = checkable.find((c) => c.id === selectedId) ?? null;
  const visible = onlyPending ? checkable.filter((c) => c.review_state === "pending" || c.id === selectedId) : checkable;

  // The claim being spoken right now, for follow-playback.
  const playingId = useMemo(() => {
    if (currentMs === null) return null;
    let match: WorkspaceClaim | null = null;
    for (const c of checkable) if (c.start_ms !== null && c.start_ms <= currentMs + 200) match = !match || c.start_ms! >= match.start_ms! ? c : match;
    return match?.id ?? null;
  }, [checkable, currentMs]);

  useEffect(() => {
    if (follow && playingId && tab === "numbers") cardRefs.current.get(playingId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [follow, playingId, tab]);

  // A link to a specific number (?claim=) brings its card into view.
  useEffect(() => {
    if (initialClaim) cardRefs.current.get(initialClaim)?.scrollIntoView({ block: "nearest" });
  }, [initialClaim]);

  const select = useCallback(
    (id: string, seek = true) => {
      setSelectedId(id);
      const claim = checkable.find((c) => c.id === id);
      if (seek && claim?.start_ms !== null && claim?.start_ms !== undefined) mediaRef.current?.seek(claim.start_ms);
      requestAnimationFrame(() => cardRefs.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    },
    [checkable],
  );

  // Keyboard: j/k move between numbers.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "j" && e.key !== "k") return;
      const list = visible;
      const at = list.findIndex((c) => c.id === selectedId);
      const next = list[e.key === "j" ? Math.min(list.length - 1, at + 1) : Math.max(0, at - 1)];
      if (next) select(next.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, select]);

  const onTime = useCallback((ms: number) => setCurrentMs(ms), []);
  const onMediaSelect = useCallback((id: string) => select(id, false), [select]);

  const meta = [check.owner?.full_name, check.desk?.name, t(`inputKind.${check.input_kind}`), formatDate(check.recorded_at, locale)]
    .filter(Boolean)
    .join(" · ");

  const stage = isMedia ? (
    <MediaStage
      ref={mediaRef}
      kind={media!.has_video ? "video" : "audio"}
      src={media!.has_video ? urls.video : (urls.audio ?? urls.video)}
      poster={urls.poster}
      waveform={(media!.waveform as number[] | null) ?? null}
      durationMs={media!.duration_ms}
      title={check.title}
      recordedLabel={formatDate(check.recorded_at, locale)}
      segments={segments}
      claims={checkable}
      selectedId={selectedId}
      pauseAtIssues={pauseAtIssues}
      onTime={onTime}
      onSelectClaim={onMediaSelect}
    />
  ) : (
    <DocumentStage
      title={check.title}
      meta={meta}
      segments={segments}
      claims={checkable}
      selectedId={selectedId}
      onSelectClaim={(id) => select(id, false)}
      originalUrl={check.input_url ?? urls.original ?? null}
    />
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:h-[min(640px,calc(100vh-240px))] lg:min-h-[460px] lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden lg:order-none">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 pt-2">
            <div role="tablist" aria-label={t("check.tabs.numbers")} className="flex gap-1">
              {(
                [
                  ["numbers", t("check.tabs.numbers"), checkable.length],
                  ["transcript", isMedia ? t("check.tabs.transcript") : t("check.tabs.document"), null],
                  ["activity", t("check.tabs.activity"), null],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm font-medium",
                    tab === key ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
                  )}
                >
                  {label}
                  {count !== null && <span className="num rounded-full bg-accent px-1.5 text-[11px] text-on-accent">{count}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === "numbers" && (
              <>
                {checkable.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <Checkbox label={t("check.needsDecisionOnly")} checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
                  </div>
                )}
                {checkable.length === 0 && <p className="p-3 text-sm text-muted">{t("check.noClaims")}</p>}
                <div className="space-y-2.5">
                  {visible.map((claim) => (
                    <ClaimCard
                      key={claim.id}
                      ref={(el) => {
                        if (el) cardRefs.current.set(claim.id, el);
                        else cardRefs.current.delete(claim.id);
                      }}
                      claim={claim}
                      segmentIdx={claim.segment_id ? segmentIdx.get(claim.segment_id) : undefined}
                      selected={claim.id === selectedId}
                      active={claim.id === playingId}
                      onSelect={() => select(claim.id)}
                    />
                  ))}
                </div>
                {unchecked.length > 0 && (
                  <details className="mt-4 rounded-md border border-dashed border-border p-3 text-sm">
                    <summary className="cursor-pointer font-medium text-muted">
                      {t("check.notChecked")} ({unchecked.length})
                    </summary>
                    <p className="mt-1 text-xs text-subtle">{t("check.notCheckedHint")}</p>
                    <ul className="mt-3 space-y-2">
                      {unchecked.map((c) => (
                        <li key={c.id} className="text-[13px] leading-relaxed">
                          «{c.span_text}»{c.uncheckable_reason && <span className="block text-xs text-muted">{c.uncheckable_reason}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
            {tab === "transcript" && (
              <Transcript
                segments={segments}
                claims={checkable}
                currentMs={currentMs}
                follow={follow}
                editable={caps.canEdit && !["processing", "archived", "published"].includes(check.status)}
                selectedId={selectedId}
                onSeek={isMedia ? (ms) => mediaRef.current?.seek(ms, true) : undefined}
                onSelectClaim={(id) => {
                  select(id);
                  setTab("numbers");
                }}
              />
            )}
            {tab === "activity" && <Activity decisions={decisions} claims={claims} />}
          </div>

          {isMedia && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-3 py-2.5 text-xs text-muted">
              <label className="flex items-center gap-2">
                <Switch checked={follow} onCheckedChange={setFollow} label={t("check.followPlayback")} />
                {t("check.followPlayback")}
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={pauseAtIssues} onCheckedChange={setPauseAtIssues} label={t("check.pauseAtIssues")} />
                {t("check.pauseAtIssues")}
              </label>
            </div>
          )}
        </Card>

        <div className="min-h-[320px] lg:min-h-0">{stage}</div>
      </div>

      {selected ? (
        <EvidencePanel
          key={selected.id}
          claim={selected}
          segmentIdx={selected.segment_id ? segmentIdx.get(selected.segment_id) : undefined}
          check={check}
          comments={comments}
          caps={caps}
        />
      ) : (
        checkable.length > 0 && (
          <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted">
            <Icon name="info" size={16} />
            {t("check.selectClaim")}
          </Card>
        )
      )}
    </div>
  );
}

function firstToReview(claims: WorkspaceClaim[]): WorkspaceClaim | undefined {
  const order = ["differs", "context", "none", "match"];
  const pending = claims.filter((c) => c.review_state === "pending" || c.review_state === "escalated");
  for (const verdict of order) {
    const found = pending.find((c) => c.result?.verdict === verdict);
    if (found) return found;
  }
  return claims[0];
}

function Activity({ decisions, claims }: { decisions: CheckDetail["decisions"]; claims: CheckDetail["claims"] }) {
  const { t, locale } = useI18n();
  if (decisions.length === 0) return <p className="p-3 text-sm text-muted">{t("check.noActivity")}</p>;
  const spans = new Map(claims.map((c) => [c.id, c.span_text]));
  return (
    <ol className="space-y-3">
      {decisions.map((d) => (
        <li key={d.id} className="flex gap-2.5 text-sm">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0">
            <p>
              <span className="font-medium">{d.user?.full_name ?? t("common.unknown")}</span>{" "}
              <span className="text-muted">{t(`check.action.${d.action}` as MessageKey)}</span>
            </p>
            {d.claim_id && spans.get(d.claim_id) && <p className="truncate text-xs text-muted">«{spans.get(d.claim_id)}»</p>}
            {d.note && !SYSTEM_NOTES.has(d.note) && <p className="mt-0.5 text-xs whitespace-pre-wrap">{d.note}</p>}
            {d.note === "verifier_objection" && <p className="mt-0.5 text-xs text-context-text">{t("check.autoEscalated")}</p>}
            <p className="text-[11px] text-subtle">{formatRelative(d.created_at, locale)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
