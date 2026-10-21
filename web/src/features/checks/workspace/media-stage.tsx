"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { Nuqta } from "@/components/ui/nuqta";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { Word } from "@/lib/types";

import { HighlightedText, spansFor } from "./highlight";
import type { WorkspaceClaim, WorkspaceSegment } from "./types";

export type MediaHandle = { seek: (ms: number, play?: boolean) => void };

const ISSUE = new Set(["context", "differs"]);
const LINE_CHARS = 72;

/** Character offsets of each timed word in the segment text, matched in order. */
function wordOffsets(text: string, words: Word[]): Array<{ at: number; start_ms: number }> {
  const offsets: Array<{ at: number; start_ms: number }> = [];
  let cursor = 0;
  for (const word of words) {
    const at = text.indexOf(word.text, cursor);
    if (at >= 0) {
      offsets.push({ at, start_ms: word.start_ms });
      cursor = at + word.text.length;
    }
  }
  return offsets;
}

/** Break a segment into caption lines at word boundaries. */
function captionLines(text: string): Array<[number, number]> {
  const lines: Array<[number, number]> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + LINE_CHARS);
    if (end < text.length) {
      const space = text.lastIndexOf(" ", end);
      if (space > start + LINE_CHARS / 2) end = space;
    }
    lines.push([start, end]);
    start = end;
    while (text[start] === " ") start++;
  }
  return lines;
}

/** The caption line being spoken at `ms`: located by word timings when present, by proportion otherwise. */
function captionAt(segment: WorkspaceSegment, ms: number): [number, number] {
  const text = segment.text;
  const lines = captionLines(text);
  if (lines.length <= 1) return [0, text.length];
  let position: number;
  const words = (segment.words as Word[] | null) ?? [];
  const offsets = words.length ? wordOffsets(text, words) : [];
  if (offsets.length) {
    const current = offsets.filter((o) => o.start_ms <= ms).at(-1) ?? offsets[0];
    position = current.at;
  } else {
    const start = segment.start_ms ?? 0;
    const span = Math.max(1, (segment.end_ms ?? start) - start);
    position = Math.floor(((ms - start) / span) * text.length);
  }
  return lines.find(([a, b]) => position >= a && position < b) ?? lines.at(-1)!;
}

export const MediaStage = forwardRef<
  MediaHandle,
  {
    kind: "video" | "audio";
    src: string | undefined;
    poster?: string;
    waveform: number[] | null;
    durationMs: number | null;
    title: string;
    recordedLabel: string;
    segments: WorkspaceSegment[];
    claims: WorkspaceClaim[];
    selectedId: string | null;
    pauseAtIssues: boolean;
    onTime: (ms: number) => void;
    onSelectClaim: (id: string) => void;
  }
>(function MediaStage(
  { kind, src, poster, waveform, durationMs, title, recordedLabel, segments, claims, selectedId, pauseAtIssues, onTime, onSelectClaim },
  ref,
) {
  const { t } = useI18n();
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const lastMs = useRef(0);
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [duration, setDuration] = useState(durationMs ?? 0);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    seek(target, play = false) {
      const el = mediaRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, target - 300) / 1000;
      lastMs.current = el.currentTime * 1000;
      if (play) void el.play().catch(() => {});
    },
  }));

  const timed = useMemo(
    () => claims.filter((c) => c.start_ms !== null).sort((a, b) => a.start_ms! - b.start_ms!),
    [claims],
  );

  const handleTime = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    const now = el.currentTime * 1000;
    const previous = lastMs.current;
    lastMs.current = now;
    setMs(now);
    onTime(now);
    // Pause when playback crosses a number that needs attention (only on forward playback, not seeks).
    if (pauseAtIssues && !el.paused && now > previous && now - previous < 1500) {
      const crossed = timed.find((c) => c.start_ms! > previous && c.start_ms! <= now && c.result && ISSUE.has(c.result.verdict));
      if (crossed) {
        el.pause();
        onSelectClaim(crossed.id);
      }
    }
  }, [onTime, onSelectClaim, pauseAtIssues, timed]);

  // Next keeps a page you leave mounted but hidden (instant back navigation), and React runs its
  // effect cleanups when it hides it: stop playback there, or the clip keeps playing unseen.
  useEffect(() => {
    const el = mediaRef.current;
    return () => el?.pause();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Space only: "k" belongs to the workspace (previous number), and both firing at once
      // paused the clip and jumped back a number.
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const el = mediaRef.current;
      if (!el) return;
      if (e.key === " ") {
        e.preventDefault();
        if (el.paused) void el.play().catch(() => {});
        else el.pause();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const segment = segments.find((s) => s.start_ms !== null && s.start_ms <= ms && ms < (s.end_ms ?? s.start_ms) + 250);
  const caption = segment ? captionAt(segment, ms) : null;
  const total = duration || durationMs || 1;

  function toggle() {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }

  function seekFromPointer(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const ratio = Math.min(1, Math.max(0, (rtl ? rect.right - e.clientX : e.clientX - rect.left) / rect.width));
    const el = mediaRef.current;
    if (el) {
      el.currentTime = (ratio * total) / 1000;
      lastMs.current = ratio * total;
      setMs(ratio * total);
    }
  }

  function fullscreen() {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.requestFullscreen?.().catch(() => {});
  }

  const mediaProps = {
    ref: mediaRef,
    src,
    preload: "metadata" as const,
    playsInline: true,
    muted,
    onTimeUpdate: handleTime,
    onSeeked: handleTime,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onLoadedMetadata: () => {
      const el = mediaRef.current;
      if (el && Number.isFinite(el.duration)) setDuration(el.duration * 1000);
    },
    onError: () => setFailed(true),
  };

  const captionNode =
    captions && segment && caption ? (
      <p className="text-center text-[17px] leading-relaxed font-medium sm:text-xl">
        <span className="box-decoration-clone rounded-sm bg-ink/75 px-2 py-0.5 text-paper">
          <HighlightedText text={segment.text} spans={spansFor(segment.id, claims)} from={caption[0]} to={caption[1]} selectedId={selectedId} />
        </span>
      </p>
    ) : null;

  return (
    <div ref={frameRef} className="flex h-full flex-col overflow-hidden rounded-lg bg-ink text-paper">
      <div className="relative flex min-h-[220px] flex-1 items-center justify-center">
        {kind === "video" ? (
          <video {...mediaProps} poster={poster} onClick={toggle} className="absolute inset-0 size-full cursor-pointer object-contain" />
        ) : (
          <>
            <audio {...mediaProps} />
            <Waveform peaks={waveform} progress={ms / total} />
          </>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-3">
          <span className="rounded-sm bg-ink/70 px-2 py-1 text-xs text-paper/90">
            {title} · {recordedLabel}
          </span>
        </div>
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/80 text-sm text-paper/80">
            <Icon name="alert" size={22} />
            {t("check.mediaUnavailable")}
          </div>
        )}
        {!playing && !failed && kind === "video" && (
          <button
            type="button"
            onClick={toggle}
            aria-label={t("check.play")}
            className="absolute flex size-16 items-center justify-center rounded-full bg-paper/90 text-ink shadow-raised transition-transform hover:scale-105"
          >
            <Icon name="play" size={28} />
          </button>
        )}
        {captionNode && <div className="pointer-events-none absolute inset-x-4 bottom-4 sm:inset-x-10">{captionNode}</div>}
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 bg-ink px-4 py-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t("check.pause") : t("check.play")}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent-hover"
        >
          <Icon name={playing ? "pause" : "play"} size={18} />
        </button>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={t("check.mute")}
          aria-pressed={muted}
          className="text-paper/70 hover:text-paper"
        >
          <Icon name={muted ? "volume-off" : "volume"} size={18} />
        </button>
        <span className="num w-[92px] shrink-0 text-xs text-paper/70" dir="ltr">
          {formatDuration(ms)} / {formatDuration(total)}
        </span>

        <div
          role="slider"
          tabIndex={0}
          aria-label={t("check.timeline")}
          aria-valuemin={0}
          aria-valuemax={Math.round(total / 1000)}
          aria-valuenow={Math.round(ms / 1000)}
          aria-valuetext={formatDuration(ms)}
          onPointerDown={seekFromPointer}
          onKeyDown={(e) => {
            const el = mediaRef.current;
            if (!el) return;
            const forward = document.documentElement.dir === "rtl" ? "ArrowLeft" : "ArrowRight";
            const back = forward === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";
            if (e.key === forward) el.currentTime = Math.min(total / 1000, el.currentTime + 5);
            else if (e.key === back) el.currentTime = Math.max(0, el.currentTime - 5);
          }}
          className="relative h-8 flex-1 cursor-pointer touch-none"
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15" />
          <div className="absolute start-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent" style={{ width: `${(ms / total) * 100}%` }} />
          {timed.map((c) => (
            <button
              key={c.id}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSelectClaim(c.id)}
              aria-label={c.span_text}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2",
                selectedId === c.id && "scale-150",
              )}
              style={{ insetInlineStart: `${(c.start_ms! / total) * 100}%` }}
            >
              <Nuqta tone={c.result?.verdict ?? "none"} size={10} />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCaptions((v) => !v)}
          aria-pressed={captions}
          aria-label={t("check.captions")}
          className={cn("hover:text-paper", captions ? "text-paper" : "text-paper/50")}
        >
          <Icon name="captions" size={18} />
        </button>
        {kind === "video" && (
          <button type="button" onClick={fullscreen} aria-label={t("check.fullscreen")} className="text-paper/70 hover:text-paper">
            <Icon name="maximize" size={18} />
          </button>
        )}
      </div>
    </div>
  );
});

function Waveform({ peaks, progress }: { peaks: number[] | null; progress: number }) {
  const bars = useMemo(() => {
    const source = peaks?.length ? peaks : Array.from({ length: 120 }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 0.7)));
    const step = Math.max(1, Math.floor(source.length / 120));
    const out: number[] = [];
    for (let i = 0; i < source.length; i += step) out.push(Math.max(...source.slice(i, i + step)));
    return out;
  }, [peaks]);
  return (
    <div className="flex h-32 w-full items-center gap-[3px] px-8 pb-16" aria-hidden>
      {bars.map((peak, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-full", i / bars.length <= progress ? "bg-accent" : "bg-white/25")}
          style={{ height: `${Math.max(6, peak * 100)}%` }}
        />
      ))}
    </div>
  );
}
